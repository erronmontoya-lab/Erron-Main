"""Find live markets where several skilled wallets hold the same outcome."""

from __future__ import annotations

import datetime as dt
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field

from .api import ApiError, Client
from .scoring import WalletScore


@dataclass
class Signal:
    token_id: str
    condition_id: str
    title: str
    outcome: str
    slug: str
    end_date: str
    holders: list[str] = field(default_factory=list)
    against: list[str] = field(default_factory=list)  # skilled wallets on the opposite outcome
    holder_cost: float = 0.0
    avg_entry: float = 0.0
    price: float = 0.0
    best_ask: float | None = None
    ask_depth_usd: float = 0.0  # $ available within `depth_band` of the best ask
    est_prob: float = 0.0
    ev_per_dollar: float = 0.0
    score: float = 0.0
    last_entry_ts: int = 0

    @property
    def drift(self) -> float:
        return self.price - self.avg_entry

    def to_dict(self) -> dict:
        d = asdict(self)
        d["drift"] = self.drift
        d["url"] = f"https://polymarket.com/event/{self.slug}" if self.slug else ""
        return d


def _is_live(pos: dict, today: str) -> bool:
    if float(pos.get("current_size") or 0) <= 0 or pos.get("redeemable"):
        return False
    end = (pos.get("end_date") or "")[:10]
    if end and end < today:
        return False
    price = float(pos.get("current_price") or 0)
    return 0.01 < price < 0.99


def _logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def logit_edge(w: WalletScore) -> float:
    """A wallet's edge as a log-odds shift, so it scales sensibly from 5c to 95c markets."""
    base = w.implied_win_rate
    if not 0 < base < 1:
        return 0.0
    return _logit(base + w.edge) - _logit(base)


def _book_stats(book: dict, band: float) -> tuple[float | None, float]:
    asks = [(float(a["price"]), float(a["size"])) for a in book.get("asks") or []]
    if not asks:
        return None, 0.0
    best = min(p for p, _ in asks)
    depth = sum(p * s for p, s in asks if p <= best + band)
    return best, depth


def find_signals(
    client: Client,
    wallets: list[WalletScore],
    min_holders: int = 2,
    min_price: float = 0.0,
    max_price: float = 1.0,
    min_holder_cost: float = 100.0,
    max_drift: float = 0.10,
    max_drop: float = 0.15,
    max_age_days: float = 14,
    depth_band: float = 0.02,
    fee: float = 0.0,
    workers: int = 8,
) -> list[Signal]:
    """Aggregate open positions of qualified wallets into ranked signals.

    est_prob is a deliberately conservative heuristic: the current price shifted in log-odds
    by the holders' average shrunk edge, scaled down further when fewer wallets agree. Prices
    already contain most of the information, so expect most EVs to be small.
    """
    by_wallet = {w.wallet: w for w in wallets}
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    min_ts = time.time() - max_age_days * 86400

    def fetch(w: WalletScore):
        try:
            return w.wallet, client.positions(w.wallet, status="OPEN", limit=500, sort_by="TIMESTAMP")
        except ApiError:
            return w.wallet, []

    with ThreadPoolExecutor(max_workers=workers) as ex:
        holdings = list(ex.map(fetch, wallets))

    groups: dict[str, Signal] = {}
    side_holders: dict[tuple[str, int], set[str]] = {}
    for wallet, positions in holdings:
        for p in positions:
            if not _is_live(p, today):
                continue
            cost = float(p.get("total_cost_usdc") or 0) or float(p.get("current_size") or 0) * float(p.get("avg_price") or 0)
            if cost < min_holder_cost:
                continue
            tok = p["token_id"]
            sig = groups.get(tok)
            if sig is None:
                sig = groups[tok] = Signal(
                    token_id=tok,
                    condition_id=p.get("condition_id", ""),
                    title=p.get("title", ""),
                    outcome=p.get("outcome", ""),
                    slug=p.get("event_slug") or p.get("slug") or "",
                    end_date=(p.get("end_date") or "")[:10],
                )
            if wallet in sig.holders:
                continue
            sig.holders.append(wallet)
            sig.avg_entry = (sig.avg_entry * sig.holder_cost + float(p["avg_price"]) * cost) / (sig.holder_cost + cost)
            sig.holder_cost += cost
            sig.price = float(p.get("current_price") or 0)
            sig.last_entry_ts = max(sig.last_entry_ts, int(p.get("last_event_at") or 0))
            side_holders.setdefault((sig.condition_id, int(p.get("outcome_index", -1))), set()).add(wallet)

    candidates = []
    for sig in groups.values():
        if len(sig.holders) < min_holders or not (min_price <= sig.price <= max_price):
            continue
        if sig.drift > max_drift:
            continue  # the move already happened; tailing now means buying their exit liquidity
        if sig.drift < -max_drop:
            continue  # price collapsed since they bought: a losing bag, not a fresh conviction
        if sig.last_entry_ts < min_ts:
            continue  # nobody has touched it recently
        for (cid, _idx), ws in side_holders.items():
            if cid == sig.condition_id:
                sig.against.extend(w for w in ws if w not in sig.holders)
        candidates.append(sig)

    def enrich(sig: Signal) -> Signal:
        try:
            sig.best_ask, sig.ask_depth_usd = _book_stats(client.book(sig.token_id), depth_band)
        except ApiError:
            pass
        n_for, n_against = len(sig.holders), len(sig.against)
        edges = [logit_edge(by_wallet[w]) for w in sig.holders if w in by_wallet]
        avg_edge = sum(edges) / len(edges) if edges else 0.0
        agreement = (n_for - n_against) / (n_for + n_against + 2)
        entry = sig.best_ask if sig.best_ask else sig.price
        sig.est_prob = min(0.99, max(0.01, _sigmoid(_logit(sig.price) + avg_edge * agreement)))
        sig.ev_per_dollar = sig.est_prob / (entry + fee) - 1 if entry else 0.0
        skill = sum(max(by_wallet[w].z, 0) for w in sig.holders if w in by_wallet)
        sig.score = skill * agreement
        return sig

    with ThreadPoolExecutor(max_workers=workers) as ex:
        signals = list(ex.map(enrich, candidates))
    signals.sort(key=lambda s: (s.ev_per_dollar > 0, s.score, s.ev_per_dollar), reverse=True)
    return signals
