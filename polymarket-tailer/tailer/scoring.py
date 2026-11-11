"""Separate skilled wallets from lucky ones.

The leaderboard ranks by raw profit, which rewards size and luck. We re-score every
candidate on its *closed* positions using a calibration test:

  A position bought at average price p is, with no edge, a win with probability ~p.
  Over n positions the expected number of wins is sum(p_i), with variance sum(p_i(1-p_i)).
  z = (wins - sum p_i) / sqrt(sum p_i(1-p_i))

A high z means the wallet wins more often than the prices it paid implied, a sign of
real edge rather than one lucky moonshot. Buying 95c favourites and winning 95% of the
time scores ~0, which is correct: that's no edge, just picking up nickels.

"Win" means PnL > 0. That includes positions sold before resolution, where the
no-edge win probability is only roughly p. Treat z as a ranking signal, not an exact p-value.

Survivorship trap: Polymarket only marks a position CLOSED once it is sold or redeemed.
Nobody redeems worthless shares, so resolved LOSERS sit in the OPEN list forever
(redeemable=true, price 0). Scoring CLOSED alone makes everyone look like a 95% winner.
We merge both lists and only score the time range both lists cover.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field

from .api import ApiError, Client

MIN_PRICE, MAX_PRICE = 0.02, 0.98  # ignore dust and near-certain fills, they carry no information
EDGE_PRIOR = 50  # pseudo-positions used to shrink the edge estimate toward 0


@dataclass
class WalletScore:
    wallet: str
    name: str
    leaderboard_pnl: float = 0.0
    n: int = 0
    wins: int = 0
    expected_wins: float = 0.0
    win_rate: float = 0.0
    implied_win_rate: float = 0.0
    edge: float = 0.0  # shrunk (actual - implied) win rate
    z: float = 0.0
    roi: float = 0.0
    realized_pnl: float = 0.0
    cost: float = 0.0
    two_sided_ratio: float = 0.0
    qualified: bool = False
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def resolved_record(pos: dict) -> tuple[int, float, float, float] | None:
    """(timestamp, avg_price, cost, pnl) for a finished position, else None."""
    price = float(pos.get("avg_price") or 0)
    ts = int(pos.get("last_event_at") or 0)
    if pos.get("status") == "CLOSED":
        cost = float(pos.get("total_size") or 0) * price
        pnl = float(pos.get("realized_pnl") or 0)
    elif pos.get("redeemable"):  # resolved but never redeemed: usually a loser
        cost = float(pos.get("total_cost_usdc") or 0) or float(pos.get("current_size") or 0) * price
        pnl = float(pos.get("total_pnl") or 0)
    else:
        return None  # still live
    return ts, price, cost, pnl


def common_window_floor(lists: list[list[dict]], limit: int) -> int:
    """Oldest timestamp covered by every list that was truncated at `limit`."""
    floor = 0
    for rows in lists:
        if len(rows) >= limit and rows:
            floor = max(floor, min(int(r.get("last_event_at") or 0) for r in rows))
    return floor


def two_sided_ratio(positions: list[dict]) -> float:
    """Share of markets where the wallet held both outcomes: a market-maker / arb fingerprint."""
    sides: dict[str, set] = {}
    for p in positions:
        cid = p.get("condition_id")
        if cid is None:
            continue
        sides.setdefault(cid, set()).add(p.get("outcome_index"))
    if not sides:
        return 0.0
    return sum(1 for s in sides.values() if len(s) > 1) / len(sides)


def score_positions(
    wallet: str,
    closed: list[dict],
    open_: list[dict],
    history: int,
    name: str = "",
    leaderboard_pnl: float = 0.0,
    cutoff_ts: int | None = None,
    min_n: int = 30,
    min_z: float = 2.0,
    max_two_sided: float = 0.25,
) -> WalletScore:
    s = WalletScore(wallet=wallet, name=name or wallet[:10], leaderboard_pnl=leaderboard_pnl)
    var = 0.0
    floor = common_window_floor([closed, open_], history)
    for p in closed + open_:
        rec = resolved_record(p)
        if rec is None:
            continue
        ts, price, cost, pnl = rec
        if ts < floor or (cutoff_ts and ts >= cutoff_ts):
            continue
        if cost <= 0 or not (MIN_PRICE <= price <= MAX_PRICE):
            continue
        s.n += 1
        s.wins += pnl > 0
        s.expected_wins += price
        var += price * (1 - price)
        s.realized_pnl += pnl
        s.cost += cost

    if s.n:
        s.win_rate = s.wins / s.n
        s.implied_win_rate = s.expected_wins / s.n
        s.edge = (s.wins - s.expected_wins) / (s.n + EDGE_PRIOR)
        s.z = (s.wins - s.expected_wins) / math.sqrt(var) if var > 0 else 0.0
        s.roi = s.realized_pnl / s.cost if s.cost else 0.0
    s.two_sided_ratio = two_sided_ratio(closed + open_)

    if s.n < min_n:
        s.reasons.append(f"only {s.n} scorable positions (<{min_n})")
    if s.z < min_z:
        s.reasons.append(f"z={s.z:.2f} below {min_z}")
    if s.roi <= 0:
        s.reasons.append(f"ROI {s.roi:+.1%} not positive")
    if s.two_sided_ratio > max_two_sided:
        s.reasons.append(f"trades both sides in {s.two_sided_ratio:.0%} of markets (market maker/arb)")
    s.qualified = not s.reasons
    return s


def candidate_wallets(client: Client, periods: list[str], per_period: int, category: str | None = None) -> dict[str, dict]:
    """Union of leaderboard entries across periods, keyed by wallet."""
    out: dict[str, dict] = {}
    for period in periods:
        for row in client.leaderboard(period=period, limit=per_period, category=category):
            w = row["user_id"].lower()
            if w not in out or row.get("pnl", 0) > out[w].get("pnl", 0):
                out[w] = row
    return out


def score_wallets(
    client: Client,
    candidates: dict[str, dict],
    history: int = 500,
    cutoff_ts: int | None = None,
    workers: int = 8,
    **kw,
) -> list[WalletScore]:
    def one(item):
        wallet, row = item
        try:
            closed = client.positions(wallet, status="CLOSED", limit=history)
            open_ = client.positions(wallet, status="OPEN", limit=history)
        except ApiError as e:
            s = WalletScore(wallet=wallet, name=row.get("user_name") or wallet[:10])
            s.reasons.append(f"fetch failed: {e}")
            return s
        return score_positions(
            wallet,
            closed,
            open_,
            history,
            name=row.get("user_name") or "",
            leaderboard_pnl=float(row.get("pnl") or 0),
            cutoff_ts=cutoff_ts,
            **kw,
        )

    with ThreadPoolExecutor(max_workers=workers) as ex:
        scores = list(ex.map(one, candidates.items()))
    scores.sort(key=lambda s: (s.qualified, s.z), reverse=True)
    return scores
