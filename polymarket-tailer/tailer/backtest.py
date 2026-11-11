"""Out-of-sample backtest of "copy their entry, N minutes late".

1. Pick a cutoff `test_days` ago. Score wallets using ONLY positions closed before it.
2. Replay the qualified wallets' BUY trades after the cutoff.
3. For each first entry into a market that has since resolved, buy at the market price
   `delay` later, plus slippage, and hold to resolution.

Known bias: the candidate pool comes from today's leaderboard, which already knows who did
well during the test window. Results are an upper bound, so read them skeptically.
"""

from __future__ import annotations

import bisect
import datetime as dt
import random
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from .api import ApiError, Client, parse_json_list
from .scoring import WalletScore


@dataclass
class Entry:
    wallet: str
    token_id: str
    condition_id: str
    title: str
    ts: int
    price: float
    usd: float
    payout: float | None = None
    close_ts: int | None = None
    history: list[tuple[int, float]] = field(default_factory=list)
    copiers: int = 1  # how many qualified wallets bought this token in the window


@dataclass
class Bucket:
    label: str
    returns: list[float] = field(default_factory=list)

    def summary(self, stake: float = 100.0, seed: int = 7) -> dict:
        r = self.returns
        n = len(r)
        if not n:
            return {"label": self.label, "n": 0}
        mean = sum(r) / n
        rng = random.Random(seed)
        boots = sorted(sum(rng.choice(r) for _ in range(n)) / n for _ in range(1000))
        return {
            "label": self.label,
            "n": n,
            "hit_rate": sum(x > 0 for x in r) / n,
            "mean_return": mean,
            "ci90": (boots[50], boots[949]),
            "pnl_flat_stake": mean * n * stake,
        }


def _price_at(history: list[tuple[int, float]], ts: int, tolerance: int = 3600) -> float | None:
    if not history:
        return None
    times = [t for t, _ in history]
    i = bisect.bisect_left(times, ts)
    if i < len(history) and history[i][0] - ts <= tolerance:
        return history[i][1]
    return None


def _parse_ts(s: str | None) -> int | None:
    if not s:
        return None
    try:
        return int(dt.datetime.fromisoformat(s).timestamp())
    except ValueError:
        return None


def collect_entries(client: Client, wallets: list[WalletScore], start: int, end: int, per_wallet: int, workers: int = 8) -> list[Entry]:
    def one(w: WalletScore) -> list[Entry]:
        try:
            trades = client.trades(w.wallet, start=start, end=end, side="BUY", limit=3000)
        except ApiError:
            return []
        first: dict[str, Entry] = {}
        for t in sorted(trades, key=lambda t: t["timestamp"]):
            tok = t["token_id"]
            usd = float(t["size"]) * float(t["price"])
            if tok in first:
                first[tok].usd += usd
                continue
            first[tok] = Entry(
                wallet=w.wallet,
                token_id=tok,
                condition_id=t["condition_id"],
                title=t.get("title", ""),
                ts=int(t["timestamp"]),
                price=float(t["price"]),
                usd=usd,
            )
        entries = list(first.values())
        if len(entries) > per_wallet:  # evenly spaced sample so heavy traders don't dominate
            step = len(entries) / per_wallet
            entries = [entries[int(i * step)] for i in range(per_wallet)]
        return entries

    with ThreadPoolExecutor(max_workers=workers) as ex:
        return [e for batch in ex.map(one, wallets) for e in batch]


def attach_resolution(client: Client, entries: list[Entry]) -> list[Entry]:
    markets = client.markets_by_condition({e.condition_id for e in entries}, closed=True)
    out = []
    for e in entries:
        m = markets.get(e.condition_id)
        if not m:
            continue
        tokens = [str(t) for t in parse_json_list(m.get("clobTokenIds"))]
        prices = parse_json_list(m.get("outcomePrices"))
        if e.token_id not in tokens or len(prices) != len(tokens):
            continue
        payout = float(prices[tokens.index(e.token_id)])
        if payout not in (0.0, 1.0) and m.get("umaResolutionStatus") != "resolved":
            continue
        e.payout = payout
        e.close_ts = _parse_ts(m.get("closedTime"))
        out.append(e)
    return out


def attach_history(client: Client, entries: list[Entry], max_delay: int, workers: int = 8) -> None:
    def one(e: Entry):
        try:
            hist = client.price_history(e.token_id, e.ts - 60, e.ts + max_delay + 3600, fidelity=1)
            e.history = sorted((int(h["t"]), float(h["p"])) for h in hist)
        except ApiError:
            e.history = []

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, entries))


def price_bucket(p: float) -> str:
    for hi, label in ((0.2, "<20c longshots"), (0.5, "20-50c"), (0.8, "50-80c"), (0.95, "80-95c")):
        if p < hi:
            return label
    return "95c+ 'sure things'"


def run_backtest(
    client: Client,
    wallets: list[WalletScore],
    test_days: int = 30,
    delays: tuple[int, ...] = (0, 300, 3600, 21600),
    slippage: float = 0.01,
    per_wallet: int = 60,
    now: int | None = None,
) -> dict:
    now = now or int(time.time())
    start = now - test_days * 86400
    entries = collect_entries(client, wallets, start, now, per_wallet)
    raw_count = len(entries)
    entries = attach_resolution(client, entries)

    counts: dict[str, set] = {}
    for e in entries:
        counts.setdefault(e.token_id, set()).add(e.wallet)
    for e in entries:
        e.copiers = len(counts[e.token_id])

    attach_history(client, entries, max(delays))

    by_delay: dict[int, Bucket] = {d: Bucket(f"delay {d // 60}m") for d in delays}
    consensus: dict[int, Bucket] = {d: Bucket(f"consensus>=2, delay {d // 60}m") for d in delays}
    by_price: dict[str, Bucket] = {}
    ref_delay = delays[1] if len(delays) > 1 else delays[0]

    for e in entries:
        for d in delays:
            t = e.ts + d
            if e.close_ts and t >= e.close_ts:
                continue
            p = e.price if d == 0 else _price_at(e.history, t)
            if p is None:
                continue
            cost = min(p + (slippage if d else 0.0), 0.999)
            r = e.payout / cost - 1
            by_delay[d].returns.append(r)
            if e.copiers >= 2:
                consensus[d].returns.append(r)
            if d == ref_delay:
                by_price.setdefault(price_bucket(p), Bucket(price_bucket(p))).returns.append(r)

    order = ["<20c longshots", "20-50c", "50-80c", "80-95c", "95c+ 'sure things'"]
    return {
        "window_days": test_days,
        "wallets": len(wallets),
        "entries_found": raw_count,
        "entries_resolved": len(entries),
        "slippage": slippage,
        "by_delay": [by_delay[d].summary() for d in delays],
        "consensus": [consensus[d].summary() for d in delays],
        "by_price": [by_price[k].summary() for k in order if k in by_price],
        "price_bucket_delay": f"{ref_delay // 60}m",
        "note": "Wallets scored only on pre-window data; candidate pool still comes from today's leaderboard (optimistic).",
    }
