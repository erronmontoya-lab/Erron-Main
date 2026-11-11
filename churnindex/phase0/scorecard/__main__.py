"""Command line: python -m scorecard <account-folder> [options]

Example:
    python -m scorecard data/acme --name "Acme" --month 2026-10
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from . import config
from .loaders import CsvFormatError, load_folder
from .metrics import MissingFxRate, add_months, compute_month, month_key, mrr_at, mrr_trend, \
    primary_currency, within_tolerance
from .report import build_pdf, money, pct


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="scorecard", description=f"{config.BRAND_NAME} Phase 0 scorecard")
    p.add_argument("folder", type=Path, help="folder with subscriptions.csv and invoices.csv")
    p.add_argument("--name", help="account name shown on the PDF (default: folder name)")
    p.add_argument("--month", help="YYYY-MM to score (default: last full month)")
    p.add_argument("--as-of", help="YYYY-MM-DD the export was taken (default: today)")
    p.add_argument("--currency", help="primary currency code (default: largest by MRR)")
    p.add_argument("--out", type=Path, help="PDF path (default: output/<folder>-<month>.pdf)")
    p.add_argument("--dashboard-mrr", type=Decimal,
                   help="MRR shown on the founder's Stripe dashboard today, to check our number")
    p.add_argument("--sample", action="store_true", help="label the PDF as sample data")
    a = p.parse_args(argv)

    as_of = datetime.strptime(a.as_of, "%Y-%m-%d") if a.as_of else datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    month = a.month or month_key(add_months(as_of.replace(day=1), -1))
    try:
        data = load_folder(a.folder)
        cur = (a.currency or primary_currency(data)).lower()
        r = compute_month(data, month, as_of, primary=cur)
        trend = mrr_trend(data, month, as_of, primary=cur)
    except (CsvFormatError, MissingFxRate) as e:
        print(f"Could not build the scorecard: {e}", file=sys.stderr)
        return 1

    name = a.name or a.folder.name
    out = a.out or Path("output") / f"{a.folder.name}-{month}.pdf"
    build_pdf(r, trend, out, name, data.notes, sample=a.sample)

    print(f"{name}, {month}")
    rows = [
        ("Recoverable revenue / month", money(r.recoverable_revenue, cur)),
        ("MRR at month start", money(r.mrr_start, cur)),
        ("MRR at month end", money(r.mrr_end, cur)),
        ("Logo churn", f"{pct(r.logo_churn_rate)} ({r.customers_churned} of {r.customers_start})"),
        ("Revenue churn", pct(r.revenue_churn_rate)),
        ("Voluntary churned MRR", money(r.voluntary_churned_mrr, cur)),
        ("Failed-payment churned MRR", money(r.involuntary_churned_mrr, cur)),
        ("Failed-payment recovery", pct(r.recovery_rate)),
        ("Trial to paid", pct(r.trial_to_paid_rate)),
    ]
    for k, v in rows:
        print(f"  {k:<30}{v}")
    for n in data.notes:
        print(f"  Note: {n}")

    if a.dashboard_mrr is not None:
        ours = mrr_at(data, as_of, cur)
        ok = within_tolerance(ours, a.dashboard_mrr)
        print(f"  MRR check: ours {money(ours, cur)} vs dashboard {money(a.dashboard_mrr, cur)}: "
              f"{'MATCH' if ok else 'DIFFERENT, look into this before sending'}")
    print(f"PDF saved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
