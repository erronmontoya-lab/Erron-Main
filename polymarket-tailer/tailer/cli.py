"""Command-line entry point.

  python -m tailer wallets              rank leaderboard wallets by skill, not luck
  python -m tailer scan                 live consensus bets among skilled wallets
  python -m tailer backtest             would copying them have made money?
  python -m tailer watch --every 10     re-scan on a loop and alert on new signals
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from .api import default_client
from .backtest import run_backtest
from .scoring import candidate_wallets, score_wallets
from .signals import find_signals


# ------------------------------------------------------------------ helpers
def _table(rows: list[list], headers: list[str]) -> str:
    cells = [headers] + [[str(c) for c in r] for r in rows]
    widths = [max(len(r[i]) for r in cells) for i in range(len(headers))]
    line = lambda r: "  ".join(c.ljust(w) for c, w in zip(r, widths))
    return "\n".join([line(headers), line(["-" * w for w in widths])] + [line(r) for r in cells[1:]])


def _short(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def _money(x: float) -> str:
    return f"${x / 1e6:.1f}M" if abs(x) >= 1e6 else f"${x / 1e3:.0f}k" if abs(x) >= 1e3 else f"${x:.0f}"


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _scored(args, cutoff_ts=None):
    client = default_client()
    periods = [p.strip().upper() for p in args.periods.split(",")]
    _log(f"Pulling leaderboard ({', '.join(periods)}, top {args.top} each)…")
    cands = candidate_wallets(client, periods, args.top, category=args.category)
    _log(f"Scoring {len(cands)} wallets on up to {args.history} closed positions each…")
    scores = score_wallets(
        client,
        cands,
        history=args.history,
        cutoff_ts=cutoff_ts,
        min_n=args.min_n,
        min_z=args.min_z,
        max_two_sided=args.max_two_sided,
    )
    return client, scores


# ------------------------------------------------------------------ commands
def cmd_wallets(args) -> None:
    _, scores = _scored(args)
    if args.json:
        print(json.dumps([s.to_dict() for s in scores], indent=2))
        return
    shown = scores if args.all else [s for s in scores if s.qualified]
    rows = [
        [
            "yes" if s.qualified else "no",
            _short(s.name, 22),
            _money(s.leaderboard_pnl),
            s.n,
            f"{s.win_rate:.0%}",
            f"{s.implied_win_rate:.0%}",
            f"{s.z:+.1f}",
            f"{s.roi:+.1%}",
            f"{s.two_sided_ratio:.0%}",
            "; ".join(s.reasons) or s.wallet,
        ]
        for s in shown[: args.limit]
    ]
    print(_table(rows, ["ok", "name", "lb pnl", "n", "won", "implied", "z", "roi", "2-sided", "wallet / why rejected"]))
    q = sum(s.qualified for s in scores)
    print(f"\n{q} of {len(scores)} leaderboard wallets pass the skill filter.")


def _run_scan(args):
    client, scores = _scored(args)
    good = [s for s in scores if s.qualified][: args.follow]
    if not good:
        _log("No wallets passed the skill filter. Loosen --min-z / --min-n or widen --periods.")
        return []
    _log(f"Scanning open positions of {len(good)} skilled wallets…")
    return find_signals(
        client,
        good,
        min_holders=args.min_holders,
        min_price=args.min_price,
        max_price=args.max_price,
        min_holder_cost=args.min_stake,
        max_drift=args.max_drift,
        max_drop=args.max_drop,
        max_age_days=args.max_age,
        fee=args.fee,
    ), {s.wallet: s for s in good}


def _print_signals(signals, names, limit) -> None:
    rows = [
        [
            _short(s.title, 48),
            _short(s.outcome, 10),
            f"{len(s.holders)}/{len(s.against)}",
            f"{s.avg_entry:.2f}",
            f"{s.price:.2f}",
            f"{s.best_ask:.2f}" if s.best_ask else "-",
            _money(s.ask_depth_usd),
            f"{s.est_prob:.0%}",
            f"{s.ev_per_dollar:+.1%}",
            s.end_date,
        ]
        for s in signals[:limit]
    ]
    print(_table(rows, ["market", "outcome", "for/vs", "entry", "now", "ask", "depth", "est p", "EV/$", "ends"]))
    for s in signals[: min(limit, 5)]:
        who = ", ".join(_short(names[w].name, 16) for w in s.holders if w in names)
        print(f"\n• {s.title} → {s.outcome}\n  held by: {who}\n  https://polymarket.com/event/{s.slug}")


def cmd_scan(args) -> None:
    res = _run_scan(args)
    if not res:
        return
    signals, names = res
    if args.json:
        print(json.dumps([s.to_dict() for s in signals], indent=2))
        return
    if not signals:
        print("No consensus positions right now. Try --min-holders 1 or a lower --min-z.")
        return
    _print_signals(signals, names, args.limit)
    print(
        "\nfor/vs = skilled wallets on this outcome / on the other side. entry = their avg price."
        "\nest p is a heuristic (price + holders' historical edge). EV/$ assumes est p is right. It isn't advice."
    )


def cmd_backtest(args) -> None:
    cutoff = int(time.time()) - args.days * 86400
    client, scores = _scored(args, cutoff_ts=cutoff)
    good = [s for s in scores if s.qualified][: args.follow]
    _log(f"{len(good)} wallets qualify on pre-window data. Replaying their entries over the last {args.days} days…")
    if not good:
        print("No wallets qualified on pre-window data; nothing to backtest.")
        return
    delays = tuple(int(x) * 60 for x in args.delays.split(","))
    report = run_backtest(client, good, test_days=args.days, delays=delays, slippage=args.slippage, per_wallet=args.per_wallet)
    if args.json:
        print(json.dumps(report, indent=2))
        return

    def rows(buckets):
        return [
            [b["label"], b["n"], f"{b['hit_rate']:.0%}", f"{b['mean_return']:+.1%}", f"[{b['ci90'][0]:+.1%}, {b['ci90'][1]:+.1%}]", _money(b["pnl_flat_stake"])]
            if b["n"]
            else [b["label"], 0, "-", "-", "-", "-"]
            for b in buckets
        ]

    hdr = ["", "bets", "won", "avg return", "90% CI", "PnL @ $100/bet"]
    print(f"Backtest: {report['wallets']} wallets, {report['entries_resolved']} resolved entries "
          f"(of {report['entries_found']}), slippage {report['slippage']:.0%} on delayed fills\n")
    print("Copy every entry, by how late you get in:")
    print(_table(rows(report["by_delay"]), hdr))
    print("\nOnly markets where 2+ skilled wallets bought:")
    print(_table(rows(report["consensus"]), hdr))
    print(f"\nBy entry price (delay {report['price_bucket_delay']}):")
    print(_table(rows(report["by_price"]), hdr))
    print(f"\nNote: {report['note']}\nIf the 90% CI crosses 0%, you can't tell the strategy from noise.")


def _notify(text: str) -> None:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=15).read()
    except Exception as e:  # alerts are best-effort
        _log(f"telegram failed: {e}")


def cmd_watch(args) -> None:
    state_file = Path(args.state)
    seen = set(json.loads(state_file.read_text())) if state_file.exists() else set()
    while True:
        res = _run_scan(args)
        if res:
            signals, names = res
            fresh = [s for s in signals if s.token_id not in seen and s.ev_per_dollar >= args.min_ev]
            for s in fresh:
                msg = (f"New tail signal: {s.title} → {s.outcome}\n"
                       f"{len(s.holders)} skilled wallets (avg entry {s.avg_entry:.2f}), now {s.price:.2f}, "
                       f"est p {s.est_prob:.0%}, EV {s.ev_per_dollar:+.1%}, ends {s.end_date}\n"
                       f"https://polymarket.com/event/{s.slug}")
                print(msg + "\n", flush=True)
                _notify(msg)
                seen.add(s.token_id)
            state_file.parent.mkdir(parents=True, exist_ok=True)
            state_file.write_text(json.dumps(sorted(seen)))
            _log(f"[{time.strftime('%H:%M')}] {len(signals)} signals, {len(fresh)} new. Sleeping {args.every}m.")
        if args.once:
            return
        time.sleep(args.every * 60)


# ------------------------------------------------------------------ argparse
def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="tailer", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        g = sp.add_argument_group("wallet selection")
        g.add_argument("--periods", default="MONTH,ALL", help="leaderboard windows to pull: DAY,WEEK,MONTH,ALL")
        g.add_argument("--top", type=int, default=100, help="wallets per leaderboard window")
        g.add_argument("--category", default=None, help="leaderboard category, e.g. SPORTS, POLITICS, CRYPTO")
        g.add_argument("--history", type=int, default=500, help="closed positions to score per wallet")
        g.add_argument("--min-n", type=int, default=30, help="min scorable closed positions")
        g.add_argument("--min-z", type=float, default=2.0, help="min calibration z-score")
        g.add_argument("--max-two-sided", type=float, default=0.25, help="max share of markets traded on both sides")
        g.add_argument("--follow", type=int, default=40, help="max qualified wallets to follow")
        sp.add_argument("--json", action="store_true", help="machine-readable output")
        sp.add_argument("--limit", type=int, default=25, help="rows to print")

    def scan_opts(sp):
        g = sp.add_argument_group("signal filters")
        g.add_argument("--min-holders", type=int, default=2, help="skilled wallets that must agree")
        g.add_argument("--min-price", type=float, default=0.05)
        g.add_argument("--max-price", type=float, default=0.95)
        g.add_argument("--min-stake", type=float, default=100, help="ignore holder positions under this $ cost")
        g.add_argument("--max-drift", type=float, default=0.10, help="skip if price is this far above their entry")
        g.add_argument("--max-drop", type=float, default=0.15, help="skip if price fell this far below their entry")
        g.add_argument("--max-age", type=float, default=14, help="only positions a holder traded in the last N days")
        g.add_argument("--fee", type=float, default=0.0, help="per-share fee to include in EV")

    sp = sub.add_parser("wallets", help="score leaderboard wallets")
    common(sp)
    sp.add_argument("--all", action="store_true", help="show rejected wallets too")
    sp.set_defaults(fn=cmd_wallets)

    sp = sub.add_parser("scan", help="find live consensus positions")
    common(sp)
    scan_opts(sp)
    sp.set_defaults(fn=cmd_scan)

    sp = sub.add_parser("backtest", help="out-of-sample copy-trading backtest")
    common(sp)
    sp.add_argument("--days", type=int, default=30, help="test window length")
    sp.add_argument("--delays", default="0,5,60,360", help="entry delays in minutes")
    sp.add_argument("--slippage", type=float, default=0.01, help="extra price paid on delayed fills")
    sp.add_argument("--per-wallet", type=int, default=60, help="max entries sampled per wallet")
    sp.set_defaults(fn=cmd_backtest)

    sp = sub.add_parser("watch", help="re-scan on a loop; alerts via Telegram if configured")
    common(sp)
    scan_opts(sp)
    sp.add_argument("--every", type=int, default=10, help="minutes between scans")
    sp.add_argument("--min-ev", type=float, default=0.0, help="only alert at or above this EV/$")
    sp.add_argument("--state", default=str(Path.home() / ".cache" / "polymarket-tailer" / "seen.json"))
    sp.add_argument("--once", action="store_true", help="run a single scan and exit")
    sp.set_defaults(fn=cmd_watch)

    args = p.parse_args(argv)
    try:
        args.fn(args)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
