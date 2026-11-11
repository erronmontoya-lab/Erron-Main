"""One-page PDF scorecard using the homepage mock's design tokens.

Copy rules apply to every string here: no em or en dashes, no invented stats,
sample data labeled as sample.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

from fpdf import FPDF

from . import config
from .metrics import MonthMetrics

INK = (0x0B, 0x12, 0x20)
RAISED = (0x13, 0x1C, 0x2E)
DARK_BORDER = (0x26, 0x32, 0x4A)
PAGE = (0xF5, 0xF7, 0xFA)
BORDER = (0xDF, 0xE4, 0xEB)
MUTED = (0x4A, 0x55, 0x68)
MUTED_ON_DARK = (0xAE, 0xB8, 0xC9)
ACCENT = (0xFF, 0x6B, 0x2C)
BLUE_LIGHT = (0x1F, 0x4F, 0xE0)
WHITE = (0xFF, 0xFF, 0xFF)

SYMBOLS = {"usd": "$", "cad": "CA$", "aud": "A$", "gbp": "GBP ", "eur": "EUR "}


def money(v: Decimal, currency: str) -> str:
    sym = SYMBOLS.get(currency, currency.upper() + " ")
    return f"{sym}{v.quantize(Decimal(1)):,}"


def pct(v: Optional[Decimal]) -> str:
    return "Not enough data" if v is None else f"{(v * 100).quantize(Decimal('0.1'))}%"


def month_label(month: str) -> str:
    return datetime.strptime(month, "%Y-%m").strftime("%B %Y")


class _Pdf(FPDF):
    def text_at(self, x, y, text, size=10, style="", color=INK, w=0, align="L"):
        self.set_xy(x, y)
        self.set_font("Helvetica", style, size)
        self.set_text_color(*color)
        self.cell(w, size * 0.45, text, align=align)


def build_pdf(r: MonthMetrics, trend: list[tuple[str, Decimal]], out: Path,
              account_name: str, notes: list[str], sample: bool = False) -> Path:
    cur = r.primary_currency
    pdf = _Pdf(format="letter", unit="mm")
    pdf.set_auto_page_break(False)
    pdf.add_page()
    W = pdf.w
    M = 14  # margin

    # Page background and dark header
    pdf.set_fill_color(*PAGE)
    pdf.rect(0, 0, W, pdf.h, style="F")
    pdf.set_fill_color(*INK)
    pdf.rect(0, 0, W, 58, style="F")
    pdf.text_at(M, 10, f"{config.BRAND_NAME} scorecard", 11, "B", MUTED_ON_DARK)
    pdf.text_at(M, 17, account_name, 20, "B", WHITE)
    pdf.text_at(M, 27, month_label(r.month), 11, "", MUTED_ON_DARK)
    if sample:
        pdf.set_fill_color(*ACCENT)
        pdf.rect(W - M - 34, 9, 34, 8, style="F")
        pdf.text_at(W - M - 34, 10.5, "SAMPLE DATA", 9, "B", INK, w=34, align="C")

    # Hero: recoverable revenue (accent always with ink text)
    pdf.set_fill_color(*ACCENT)
    pdf.rect(M, 36, W - 2 * M, 30, style="F")
    pdf.text_at(M + 6, 39, "Estimated recoverable revenue per month", 10, "B", INK)
    pdf.text_at(M + 6, 46, money(r.recoverable_revenue, cur), 28, "B", INK)
    pdf.text_at(M + 6, 59,
                f"{money(r.recoverable_voluntary, cur)} from cancellations  +  "
                f"{money(r.recoverable_failed_payments, cur)} from failed payments", 9, "", INK)

    # Metric tiles
    tiles = [
        ("MRR at month end", money(r.mrr_end, cur), f"Started the month at {money(r.mrr_start, cur)}"),
        ("Logo churn", pct(r.logo_churn_rate), f"{r.customers_churned} of {r.customers_start} paying customers"),
        ("Revenue churn", pct(r.revenue_churn_rate), f"{money(r.churned_mrr, cur)} MRR cancelled"),
        ("Voluntary churn", money(r.voluntary_churned_mrr, cur), "MRR from customers who chose to cancel"),
        ("Failed-payment churn", money(r.involuntary_churned_mrr, cur), "MRR lost to failed or disputed payments"),
        ("Failed-payment recovery", pct(r.recovery_rate),
         f"{r.recovered_invoices} of {r.failed_invoices - r.open_failed_invoices} invoices paid within "
         f"{config.RECOVERY_WINDOW_DAYS} days"),
        ("Trial to paid", pct(r.trial_to_paid_rate), f"{r.trials_converted} of {r.trials_ended} trials converted"),
        ("Expansion and contraction", f"+{money(r.expansion_mrr, cur)} / -{money(r.contraction_mrr, cur)}",
         "Upgrades and downgrades, not churn"),
        ("New and reactivated MRR", money(r.new_mrr, cur), f"{r.paused_customers} customers paused"),
    ]
    cols, gap, top, th = 3, 4, 74, 25
    tw = (W - 2 * M - gap * (cols - 1)) / cols
    for i, (label, value, sub) in enumerate(tiles):
        x = M + (i % cols) * (tw + gap)
        y = top + (i // cols) * (th + gap)
        pdf.set_fill_color(*WHITE)
        pdf.set_draw_color(*BORDER)
        pdf.rect(x, y, tw, th, style="DF")
        pdf.text_at(x + 4, y + 3, label, 8, "B", MUTED)
        pdf.text_at(x + 4, y + 9, value, 15, "B", INK)
        pdf.text_at(x + 4, y + 18, sub, 7, "", MUTED)

    # MRR trend bar chart
    y0 = top + 3 * (th + gap) + 2
    pdf.text_at(M, y0, "MRR at the end of each month", 10, "B", INK)
    ch_top, ch_h = y0 + 7, 34
    peak = max((v for _, v in trend), default=Decimal(0)) or Decimal(1)
    slot = (W - 2 * M) / max(len(trend), 1)
    for i, (mo, v) in enumerate(trend):
        h = float(v / peak) * ch_h
        x = M + i * slot + slot * 0.18
        pdf.set_fill_color(*BLUE_LIGHT)
        if h > 0:
            pdf.rect(x, ch_top + ch_h - h, slot * 0.64, h, style="F")
        pdf.text_at(M + i * slot, ch_top + ch_h + 1.5,
                    datetime.strptime(mo, "%Y-%m").strftime("%b %y"), 6.5, "", MUTED, w=slot, align="C")
    pdf.text_at(M, y0, f"Highest month: {money(peak, cur)}", 7, "", MUTED, w=W - 2 * M, align="R")

    # Benchmark and assumptions
    y1 = ch_top + ch_h + 9
    half = (W - 2 * M - gap) / 2
    pdf.set_fill_color(*RAISED)
    pdf.rect(M, y1, half, 40, style="F")
    pdf.text_at(M + 4, y1 + 3, "How you compare", 10, "B", WHITE)
    pdf.set_xy(M + 4, y1 + 10)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED_ON_DARK)
    pdf.multi_cell(half - 8, 4, align="L", text=
                   "Benchmark building. Peer percentiles appear once enough similar apps "
                   "have connected to keep every app anonymous. Until then we compare your "
                   "failed-payment recovery with Stripe's published average of "
                   f"{pct(config.DEFAULT_PEER_RECOVERY_RATE)}.")

    x2 = M + half + gap
    pdf.set_fill_color(*WHITE)
    pdf.rect(x2, y1, half, 40, style="DF")
    pdf.text_at(x2 + 4, y1 + 3, "How we estimate recoverable revenue", 10, "B", INK)
    pdf.set_xy(x2 + 4, y1 + 10)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(half - 8, 4, align="L", text=
                   f"Voluntary churned MRR x {pct(r.save_rate)} assumed save rate, plus "
                   f"MRR with a failed payment ({money(r.failed_payment_mrr_at_risk, cur)}) x the gap "
                   f"between {pct(r.peer_recovery_rate)} and your recovery rate. "
                   "Both rates are assumptions you can change.")

    # Notes and footer
    all_notes = list(notes)
    if r.multi_currency:
        all_notes.append(f"You bill in more than one currency. Totals are converted to {cur.upper()}.")
    inferred = sum(v for k, v in r.classification_methods.items() if k != "stripe_reason")
    if inferred:
        all_notes.append(f"{inferred} cancellation(s) had no Stripe reason, so we classified them "
                         "by whether the final invoice was paid.")
    if r.open_failed_invoices:
        all_notes.append(f"{r.open_failed_invoices} failed invoice(s) are still inside the "
                         f"{config.RECOVERY_WINDOW_DAYS}-day window and are left out of the recovery rate.")
    y2 = y1 + 45
    pdf.set_xy(M, y2)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*MUTED)
    for n in all_notes[:5]:
        pdf.set_x(M)
        pdf.multi_cell(W - 2 * M, 3.4, f"Note: {n}", align="L")
    pdf.text_at(M, pdf.h - 12,
                "Computed from your Stripe export. Please check these numbers against your Stripe "
                "dashboard and reply if anything differs by more than "
                f"{pct(config.MATCH_TOLERANCE)}.", 7, "", MUTED)

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out))
    return out
