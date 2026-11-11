"""Read Stripe dashboard CSV exports into the shapes in models.py.

Stripe lets founders pick export columns, and names shift over time, so each
field accepts several header spellings (see ALIASES). Headers are compared
lowercased, with "(UTC)" and punctuation removed. If a required column is
missing, the error names the file, the field and the spellings we accept.

Privacy: we never read email, name, address or card columns. Only the fields
listed in ALIASES are kept.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

from .models import Dataset, Discount, Invoice, Item, Subscription

ALIASES: dict[str, list[str]] = {
    # subscriptions export
    "sub_id": ["id", "subscription_id"],
    "customer_id": ["customer_id", "customer"],
    "status": ["status"],
    "amount": ["amount", "plan_amount", "price_amount", "unit_amount"],
    "interval": ["interval", "plan_interval", "price_interval"],
    "interval_count": ["interval_count", "plan_interval_count"],
    "quantity": ["quantity"],
    "currency": ["currency", "plan_currency"],
    "start": ["start", "start_date", "created"],
    "trial_end": ["trial_end"],
    "ended_at": ["ended_at"],
    "canceled_at": ["canceled_at", "cancelled_at"],
    "cancellation_reason": ["cancellation_reason", "cancellation_details_reason"],
    "coupon": ["coupon", "coupon_id", "discount_coupon", "discount"],
    "discount_start": ["discount_start"],
    "pause_start": ["pause_start", "paused_at"],
    "pause_end": ["pause_end", "resumes_at", "pause_collection_resumes_at"],
    "item_start": ["item_start"],
    "item_end": ["item_end"],
    # invoices export
    "invoice_id": ["id", "invoice_id"],
    "subscription": ["subscription", "subscription_id"],
    "created": ["date", "created", "invoice_date"],
    "amount_due": ["amount_due", "total"],
    "amount_paid": ["amount_paid"],
    "paid_at": ["paid_at", "status_transitions_paid_at"],
    "attempt_count": ["attempt_count"],
    # charges export
    "charge_invoice": ["invoice_id", "invoice"],
    "charge_status": ["status"],
    "charge_paid": ["paid", "captured"],
    # coupons export
    "coupon_id": ["id", "coupon_id"],
    "percent_off": ["percent_off"],
    "amount_off": ["amount_off"],
    "duration": ["duration"],
    "duration_in_months": ["duration_in_months"],
    # fx file (our own simple format)
    "month": ["month"],
    "rate": ["rate"],
}

DATE_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
                "%m/%d/%Y %H:%M", "%m/%d/%Y")


class CsvFormatError(Exception):
    pass


def _norm(header: str) -> str:
    h = header.lower().replace("(utc)", "")
    return re.sub(r"[^a-z0-9]+", "_", h).strip("_")


class _Row:
    def __init__(self, raw: dict[str, str], file: str):
        self.raw = {_norm(k): (v or "").strip() for k, v in raw.items() if k}
        self.file = file

    def get(self, field: str) -> str:
        for name in ALIASES[field]:
            if self.raw.get(name):
                return self.raw[name]
        return ""

    def has_column(self, field: str) -> bool:
        return any(name in self.raw for name in ALIASES[field])


def _read(path: Path, required: list[str]) -> list[_Row]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = [_Row(r, path.name) for r in csv.DictReader(f)]
    if rows:
        missing = [fld for fld in required if not rows[0].has_column(fld)]
        if missing:
            detail = "; ".join(f"{fld} (any of: {', '.join(ALIASES[fld])})" for fld in missing)
            raise CsvFormatError(f"{path.name} is missing columns: {detail}")
    return rows


def parse_date(s: str) -> Optional[datetime]:
    if not s:
        return None
    if s.isdigit():  # unix timestamp
        return datetime.fromtimestamp(int(s), tz=timezone.utc).replace(tzinfo=None)
    s = s.replace("Z", "").split("+")[0]
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise CsvFormatError(f"Cannot read date {s!r}")


def parse_money(s: str) -> Decimal:
    clean = re.sub(r"[^0-9.\-]", "", s)
    if clean in ("", "-", "."):
        return Decimal(0)
    try:
        return Decimal(clean)
    except InvalidOperation:
        raise CsvFormatError(f"Cannot read amount {s!r}")


def _truthy(s: str) -> bool:
    return s.lower() in ("true", "yes", "1", "succeeded", "paid")


def load_coupons(path: Path) -> dict[str, Discount]:
    out = {}
    for r in _read(path, ["coupon_id", "duration"]):
        out[r.get("coupon_id")] = Discount(
            duration=r.get("duration").lower(),
            percent_off=parse_money(r.get("percent_off")) if r.get("percent_off") else None,
            amount_off=parse_money(r.get("amount_off")) if r.get("amount_off") else None,
            duration_in_months=int(r.get("duration_in_months")) if r.get("duration_in_months") else None,
        )
    return out


def load_subscriptions(path: Path, coupons: dict[str, Discount], notes: list[str]) -> list[Subscription]:
    rows = _read(path, ["sub_id", "customer_id", "status", "amount", "interval", "currency", "start"])
    grouped: dict[str, list[_Row]] = defaultdict(list)
    for r in rows:
        grouped[r.get("sub_id")].append(r)

    subs = []
    unknown_coupons: set[str] = set()
    for sid, group in grouped.items():
        first = group[0]
        start = parse_date(first.get("start"))
        status = first.get("status").lower()
        ended = parse_date(first.get("ended_at"))
        if ended is None and status == "canceled":
            ended = parse_date(first.get("canceled_at"))
        # One row per subscription is normal. Extra rows with item_start and
        # item_end describe plan changes over time.
        items = []
        for r in group:
            items.append(Item(
                unit_amount=parse_money(r.get("amount")),
                interval=r.get("interval").lower(),
                start=parse_date(r.get("item_start")) or start,
                end=parse_date(r.get("item_end")),
                quantity=int(r.get("quantity") or 1),
                interval_count=int(r.get("interval_count") or 1),
            ))
        discount = None
        code = first.get("coupon")
        if code:
            if code in coupons:
                d = coupons[code]
                discount = Discount(d.duration, d.percent_off, d.amount_off,
                                    d.duration_in_months, parse_date(first.get("discount_start")))
            else:
                unknown_coupons.add(code)
        pauses = []
        ps = parse_date(first.get("pause_start"))
        if ps or status == "paused":
            pauses.append((ps or start, parse_date(first.get("pause_end"))))
        subs.append(Subscription(
            id=sid,
            customer_id=first.get("customer_id"),
            currency=first.get("currency").lower(),
            status=status,
            start=start,
            items=items,
            trial_end=parse_date(first.get("trial_end")),
            ended_at=ended,
            cancellation_reason=first.get("cancellation_reason").lower() or None,
            discount=discount,
            pauses=pauses,
        ))
    if unknown_coupons:
        notes.append(
            f"{len(unknown_coupons)} coupon code(s) had no terms, so MRR is shown before "
            f"those discounts. Add a coupons export to fix this."
        )
    if all(len(g) == 1 for g in grouped.values()):
        notes.append(
            "The subscriptions export shows each subscription's current price only. "
            "Months before a plan change use today's price."
        )
    return subs


def load_invoices(path: Path, charges_path: Optional[Path], notes: list[str]) -> list[Invoice]:
    rows = _read(path, ["invoice_id", "customer_id", "created", "amount_due", "status"])
    failures: dict[str, datetime] = {}
    successes: dict[str, datetime] = {}
    if charges_path:
        for c in _read(charges_path, ["charge_invoice", "created"]):
            inv_id = c.get("charge_invoice")
            if not inv_id:
                continue
            when = parse_date(c.get("created"))
            status = c.get("charge_status").lower()
            if status in ("succeeded", "paid"):
                ok = True
            elif status == "failed":
                ok = False
            elif c.get("charge_paid"):
                ok = _truthy(c.get("charge_paid"))
            else:
                continue  # pending or unknown charge, ignore
            bucket = successes if ok else failures
            if inv_id not in bucket or when < bucket[inv_id]:
                bucket[inv_id] = when

    estimated = 0
    out = []
    for r in rows:
        iid = r.get("invoice_id")
        created = parse_date(r.get("created"))
        status = r.get("status").lower()
        due = parse_money(r.get("amount_due"))
        paid_amt = parse_money(r.get("amount_paid")) if r.get("amount_paid") else (due if status == "paid" else Decimal(0))
        paid_at = successes.get(iid) or parse_date(r.get("paid_at"))
        first_failed = failures.get(iid)
        if not charges_path:
            attempts = int(r.get("attempt_count") or 0)
            if attempts > 1 or (attempts == 1 and status in ("open", "uncollectible")):
                first_failed = created
                estimated += 1
        if paid_at is None and status == "paid":
            paid_at = created
        if first_failed and paid_at and paid_at < first_failed:
            first_failed = None  # charge history out of order; paid before failing
        out.append(Invoice(
            id=iid,
            customer_id=r.get("customer_id"),
            subscription_id=r.get("subscription") or None,
            created=created,
            currency=(r.get("currency") or "usd").lower(),
            amount_due=due,
            amount_paid=paid_amt,
            status=status,
            first_failed_at=first_failed,
            paid_at=paid_at,
        ))
    if estimated:
        notes.append(
            f"No charges export was given, so failed payments for {estimated} invoice(s) were "
            f"estimated from attempt counts. Add a charges export for exact recovery timing."
        )
    return out


def load_fx(path: Path) -> dict[tuple[str, str], Decimal]:
    return {(r.get("currency").lower(), r.get("month")): parse_money(r.get("rate"))
            for r in _read(path, ["currency", "month", "rate"])}


def load_folder(folder: Path) -> Dataset:
    """Load an account folder holding subscriptions.csv and invoices.csv, plus
    optional charges.csv, coupons.csv and fx.csv."""
    folder = Path(folder)
    notes: list[str] = []

    def opt(name: str) -> Optional[Path]:
        p = folder / name
        return p if p.exists() else None

    for needed in ("subscriptions.csv", "invoices.csv"):
        if not (folder / needed).exists():
            raise CsvFormatError(f"{folder} needs a file named {needed}")
    coupons = load_coupons(opt("coupons.csv")) if opt("coupons.csv") else {}
    subs = load_subscriptions(folder / "subscriptions.csv", coupons, notes)
    invoices = load_invoices(folder / "invoices.csv", opt("charges.csv"), notes)
    fx = load_fx(opt("fx.csv")) if opt("fx.csv") else {}
    return Dataset(subs, invoices, fx, notes)
