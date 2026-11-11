"""Offline tests for the scoring and backtest math. Run: python -m unittest discover tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tailer.backtest import Bucket, _parse_ts, _price_at, price_bucket  # noqa: E402
from tailer.scoring import common_window_floor, resolved_record, score_positions, two_sided_ratio  # noqa: E402
from tailer.signals import _book_stats, logit_edge  # noqa: E402


def closed(price, pnl, ts=100, size=100, cid="c", idx=0):
    return {"status": "CLOSED", "avg_price": price, "total_size": size, "realized_pnl": pnl,
            "last_event_at": ts, "condition_id": cid, "outcome_index": idx}


def dead(price, ts=100, size=100, cid="d", idx=0):
    """Resolved loser that was never redeemed: still listed as OPEN."""
    return {"status": "OPEN", "redeemable": True, "avg_price": price, "current_size": size,
            "total_cost_usdc": price * size, "total_pnl": -price * size, "last_event_at": ts,
            "condition_id": cid, "outcome_index": idx}


class ScoringTests(unittest.TestCase):
    def test_unredeemed_losers_count_against_the_wallet(self):
        wins = [closed(0.5, 50, cid=f"w{i}") for i in range(40)]
        losses = [dead(0.5, cid=f"l{i}") for i in range(40)]
        only_closed = score_positions("0x", wins, [], history=500, min_n=10)
        honest = score_positions("0x", wins, losses, history=500, min_n=10)
        self.assertEqual(only_closed.win_rate, 1.0)
        self.assertAlmostEqual(honest.win_rate, 0.5)
        self.assertAlmostEqual(honest.z, 0.0)
        self.assertFalse(honest.qualified)

    def test_buying_favourites_is_not_edge(self):
        # 95c favourites that win 95% of the time: high win rate, zero skill.
        rows = [closed(0.95, 5, cid=f"f{i}") for i in range(95)] + [closed(0.95, -95, cid=f"x{i}") for i in range(5)]
        s = score_positions("0x", rows, [], history=500)
        self.assertAlmostEqual(s.win_rate, 0.95)
        self.assertLess(abs(s.z), 0.5)
        self.assertFalse(s.qualified)

    def test_real_edge_qualifies(self):
        rows = [closed(0.4, 60, cid=f"w{i}") for i in range(60)] + [dead(0.4, cid=f"l{i}") for i in range(40)]
        s = score_positions("0x", rows[:60], rows[60:], history=500)
        self.assertGreater(s.z, 2.0)
        self.assertGreater(s.roi, 0)
        self.assertTrue(s.qualified, s.reasons)

    def test_cutoff_excludes_future_positions(self):
        rows = [closed(0.5, 50, ts=10, cid=f"a{i}") for i in range(5)] + [closed(0.5, 50, ts=999, cid=f"b{i}") for i in range(5)]
        self.assertEqual(score_positions("0x", rows, [], history=500, cutoff_ts=500).n, 5)

    def test_common_window_only_when_truncated(self):
        a = [{"last_event_at": t} for t in (50, 40)]
        b = [{"last_event_at": t} for t in (90, 80)]
        self.assertEqual(common_window_floor([a, b], limit=2), 80)
        self.assertEqual(common_window_floor([a, b], limit=3), 0)

    def test_two_sided_and_live_positions(self):
        rows = [closed(0.5, 1, cid="m", idx=0), closed(0.5, 1, cid="m", idx=1), closed(0.5, 1, cid="n")]
        self.assertAlmostEqual(two_sided_ratio(rows), 0.5)
        self.assertIsNone(resolved_record({"status": "OPEN", "redeemable": False}))


class SignalTests(unittest.TestCase):
    def test_book_stats_handles_unsorted_asks(self):
        book = {"asks": [{"price": "0.90", "size": "10"}, {"price": "0.61", "size": "100"}, {"price": "0.60", "size": "50"}]}
        best, depth = _book_stats(book, band=0.02)
        self.assertEqual(best, 0.60)
        self.assertAlmostEqual(depth, 0.60 * 50 + 0.61 * 100)

    def test_logit_edge_sign(self):
        from tailer.scoring import WalletScore
        self.assertGreater(logit_edge(WalletScore("w", "w", implied_win_rate=0.4, edge=0.05)), 0)
        self.assertEqual(logit_edge(WalletScore("w", "w")), 0.0)


class BacktestTests(unittest.TestCase):
    def test_price_at(self):
        h = [(100, 0.4), (200, 0.5), (300, 0.6)]
        self.assertEqual(_price_at(h, 150), 0.5)
        self.assertIsNone(_price_at(h, 301))
        self.assertIsNone(_price_at(h, 50, tolerance=10))

    def test_bucket_summary(self):
        s = Bucket("x", [1.0, -1.0, 0.5, -0.5]).summary()
        self.assertEqual(s["n"], 4)
        self.assertAlmostEqual(s["mean_return"], 0.0)
        self.assertLessEqual(s["ci90"][0], 0.0)
        self.assertGreaterEqual(s["ci90"][1], 0.0)

    def test_helpers(self):
        self.assertEqual(price_bucket(0.97), "95c+ 'sure things'")
        self.assertEqual(price_bucket(0.1), "<20c longshots")
        self.assertEqual(_parse_ts("2026-10-05 22:30:13+00"), 1791239413)
        self.assertIsNone(_parse_ts("garbage"))


if __name__ == "__main__":
    unittest.main()
