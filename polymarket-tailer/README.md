# Polymarket Tailer

A research prototype that scans the Polymarket leaderboards, separates skilled traders from lucky ones, surfaces the live bets they agree on, and backtests whether copying them actually makes money.

Pure Python 3.10+ standard library. No API keys, no installs. Read-only: it never places trades.

```bash
cd polymarket-tailer
python -m tailer wallets            # who on the leaderboard has real edge?
python -m tailer scan               # what are those wallets betting on right now?
python -m tailer backtest           # would tailing them have been profitable?
python -m tailer watch --every 10   # re-scan on a loop, alert on new signals
python -m unittest discover tests   # offline tests
```

Every command takes `--help`, `--json`, and the wallet-selection flags below.

## How it works

### 1. Wallet scoring (`tailer/scoring.py`)

Pulls the top wallets from several leaderboard windows (`--periods MONTH,ALL`, `--top 100`) and re-scores each one on its finished positions with a **calibration test**:

> A position bought at price *p* wins about *p* of the time if the trader has no edge.
> `z = (wins − Σp) / √Σp(1−p)`

A high z means the wallet wins more often than the prices it paid implied. Buying 95¢ favourites and winning 95% of the time scores about 0, which is correct: that's no edge.

A wallet qualifies when it has `--min-n 30`+ scorable positions, `z ≥ --min-z 2.0`, positive ROI, and trades both sides of fewer than `--max-two-sided 25%` of its markets (this filters out market makers and arbitrageurs, whose PnL you can't copy).

> **The survivorship trap this fixes.** Polymarket only marks a position CLOSED once it's sold or redeemed. Nobody redeems worthless shares, so resolved *losers* stay in the OPEN list forever. Score CLOSED positions alone and every top wallet looks like a 90%+ winner. One top-10 wallet had more than $25M of unredeemed losing positions. The scorer merges both lists over the time window they share.

### 2. Live signals (`tailer/signals.py`)

For the qualified wallets (`--follow 40`), it groups open positions by outcome and keeps those where:

| filter | default | why |
|---|---|---|
| `--min-holders` | 2 | several skilled wallets agree |
| `--min-price` / `--max-price` | 0.05 / 0.95 | set `--min-price 0.7` for "high probability" bets only |
| `--max-drift` | 0.10 | price already ran up past their entry, so you'd be their exit liquidity |
| `--max-drop` | 0.15 | price collapsed after they bought, so it's a losing bag, not conviction |
| `--max-age` | 14 days | a holder traded it recently |
| `--min-stake` | $100 | ignore dust positions |

Each signal shows skilled wallets for and against, their average entry, the live best ask and order-book depth within 2¢, an estimated probability, and EV per $1.

`est p` shifts the market price in log-odds by the holders' historical (shrunk) edge, scaled down when fewer wallets agree or some are on the other side. It's a heuristic. Markets already price most information in, so expect small EVs and treat big ones with suspicion.

### 3. Backtest (`tailer/backtest.py`)

An out-of-sample test of "copy their entry, N minutes late":

1. Score wallets using only positions closed **before** the window (`--days 30`).
2. Replay those wallets' BUY trades inside the window (first entry per market, `--per-wallet 60` sample).
3. Keep markets that have resolved, then buy at the CLOB price `--delays 0,5,60,360` minutes later plus `--slippage 0.01`, and hold to resolution.

It reports results by delay, for consensus (2+ wallets) bets only, and by entry-price bucket, each with a bootstrap 90% confidence interval.

Known bias: the candidate pool comes from *today's* leaderboard, which already knows who did well during the window. Treat results as an upper bound.

## First results (run 2026-11-11, 30-day window, 13 wallets, 239 resolved bets)

| copy delay | bets | won | avg return | 90% CI |
|---|---|---|---|---|
| 0 min (their exact price) | 239 | 56% | +15.2% | +1.4% to +28.7% |
| 5 min | 238 | 56% | +8.3% | −4.7% to +21.7% |
| 60 min | 217 | 57% | −9.6% | −20.6% to +0.7% |
| 6 hours | 98 | 52% | −15.9% | −31.9% to +0.6% |

By entry price (5-minute delay): longshots under 20¢ returned −46%, 20–50¢ returned +33%, 50–80¢ about +2%, 80–95¢ +8%, and 95¢+ "sure things" +0.7%.

What this suggests:

- **The edge is real but fades fast.** These wallets do beat the market at their own fill prices. Five minutes later, most of that is gone and the result can't be told apart from noise. An hour later, it's negative.
- **Speed matters more than selection.** Any version that makes money has to react within minutes, which means polling often or watching on-chain fills, not checking a dashboard once a day.
- **"High probability" bets are low-return, not free money.** 95¢+ entries won every time and made 0.7%.
- **Consensus bets (2+ wallets) looked better** but only had 16 samples. Rerun with a longer `--days` window before trusting it.
- One 30-day window is a small sample. Rerun with different `--days`, `--periods` and `--category` values before acting on any of this.

## Alerts

`watch` prints new signals and, if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, sends them to Telegram. Seen signals are stored in `~/.cache/polymarket-tailer/seen.json`. API responses are cached for 10 minutes in `~/.cache/polymarket-tailer` (override with `TAILER_CACHE_DIR`).

## APIs used

All public and unauthenticated:

- `data-api.polymarket.com/v2`: `/leaderboard`, `/positions`, `/trades` (cursor pagination)
- `gamma-api.polymarket.com/markets`: resolution data (pass `closed=true` for resolved markets)
- `clob.polymarket.com`: `/book`, `/prices-history`

## Not investment advice

This is a research tool. Prediction markets can lose you your whole stake, past results don't predict future ones, and access to Polymarket depends on where you live. Check that it's legal for you before trading.
