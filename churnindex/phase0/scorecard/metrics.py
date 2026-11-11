"""Scorecard metrics, as defined in section 8 of churnindex/CLAUDE.md.

Every number here must have a test in tests/test_metrics.py. Plain Python and
Decimal only: no AI, no floating point money.

Judgment calls not spelled out in the brief are marked DECISION. They are also
listed in the README for the engineer review (brief section 11, item 1).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from . import config
from .models import Dataset, Discount, Invoice, Item, Subscription

TINY = timedelta(microseconds=1)
ZERO = Decimal("0")

# Monthly normalization factors. Weekly is x 52 / 12 per the brief.
INTERVAL_TO_MONTHLY = {
    "day": Decimal(365) / Decimal(12),
    "week": Decimal(52) / Decimal(12),
    "month": Decimal(1),
    "year": Decimal(1) / Decimal(12),
}


class MissingFxRate(Exception):
    pass


# ---------------------------------------------------------------- time helpers


def add_months(dt: datetime, months: int) -> datetime:
    """Same day-of-month `months` later, clamped to the month's last day."""
    y, m = divmod(dt.month - 1 + months, 12)
    year, month = dt.year + y, m + 1
    next_first = datetime(year + (month == 12), month % 12 + 1, 1)
    last_day = (next_first - timedelta(days=1)).day
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


def month_bounds(month: str) -> tuple[datetime, datetime]:
    """'2026-10' -> (2026-10-01 00:00, 2026-11-01 00:00). End is exclusive."""
    start = datetime.strptime(month, "%Y-%m")
    return start, add_months(start, 1)


def month_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def months_back(month: str, count: int) -> list[str]:
    """The `count` months ending with `month`, oldest first."""
    start, _ = month_bounds(month)
    return [month_key(add_months(start, -i)) for i in range(count - 1, -1, -1)]


# ------------------------------------------------------------ MRR at an instant


def item_monthly_amount(item: Item) -> Decimal:
    if item.interval not in INTERVAL_TO_MONTHLY:
        raise ValueError(f"Unknown billing interval: {item.interval!r}")
    per_interval = item.unit_amount * item.quantity / item.interval_count
    return per_interval * INTERVAL_TO_MONTHLY[item.interval]


def _discount_active(d: Discount, sub: Subscription, t: datetime) -> bool:
    start = d.start or sub.start
    if t < start:
        return False
    if d.duration == "forever":
        return True
    if d.duration == "repeating":
        return t < add_months(start, d.duration_in_months or 0)
    # "once" applies to a single invoice: a one-time discount, not MRR.
    return False


def _active_items(sub: Subscription, t: datetime) -> list[Item]:
    return [i for i in sub.items if i.start <= t and (i.end is None or t < i.end)]


def is_live(sub: Subscription, t: datetime) -> bool:
    """Subscription exists at t (started and not yet ended)."""
    if sub.status in config.NEVER_STARTED_STATUSES:
        return False
    return sub.start <= t and (sub.ended_at is None or t < sub.ended_at)


def is_trialing(sub: Subscription, t: datetime) -> bool:
    return sub.trial_end is not None and t < sub.trial_end


def is_paused(sub: Subscription, t: datetime) -> bool:
    return any(s <= t and (e is None or t < e) for s, e in sub.pauses)


def fx_rate(ds: Dataset, currency: str, primary: str, t: datetime) -> Decimal:
    if currency == primary:
        return Decimal(1)
    key = (currency, month_key(t))
    if key not in ds.fx_rates:
        raise MissingFxRate(
            f"Need an exchange rate for {currency} to {primary} in {key[1]}. "
            f"Add it to the fx rates file."
        )
    return ds.fx_rates[key]


def subscription_mrr(sub: Subscription, t: datetime, ds: Dataset, primary: str) -> Decimal:
    """MRR this subscription contributes at instant t, in the primary currency.

    Zero while trialing, paused, not yet started or ended. Recurring discounts
    (repeating while active, forever) are netted out. Tax and one-time charges
    are never in subscription items, so they are excluded by construction.
    """
    if not is_live(sub, t) or is_trialing(sub, t) or is_paused(sub, t):
        return ZERO
    items = _active_items(sub, t)
    gross = sum((item_monthly_amount(i) for i in items), ZERO)
    net = gross
    d = sub.discount
    if d is not None and items and _discount_active(d, sub, t):
        if d.percent_off is not None:
            net = gross * (Decimal(100) - d.percent_off) / Decimal(100)
        elif d.amount_off is not None:
            # amount_off is charged per invoice, so normalize it with the
            # subscription's billing interval (taken from its first item).
            first = items[0]
            monthly_off = d.amount_off / first.interval_count * INTERVAL_TO_MONTHLY[first.interval]
            net = gross - monthly_off
    net = max(net, ZERO)
    return net * fx_rate(ds, sub.currency, primary, t)


def mrr_at(ds: Dataset, t: datetime, primary: str) -> Decimal:
    return sum((subscription_mrr(s, t, ds, primary) for s in ds.subscriptions), ZERO)


def customer_mrr_at(ds: Dataset, t: datetime, primary: str) -> dict[str, Decimal]:
    out: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for s in ds.subscriptions:
        v = subscription_mrr(s, t, ds, primary)
        if v > 0:
            out[s.customer_id] += v
    return dict(out)


def primary_currency(ds: Dataset) -> str:
    """Currency carrying the most list-price MRR across all subscriptions."""
    weight: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for s in ds.subscriptions:
        for i in s.items:
            weight[s.currency] += item_monthly_amount(i)
    if not weight:
        return "usd"
    return max(weight, key=lambda c: weight[c])


def is_multi_currency(ds: Dataset) -> bool:
    return len({s.currency for s in ds.subscriptions}) > 1


# ----------------------------------------------------------- monthly metrics


@dataclass
class ChurnedSubscription:
    subscription_id: str
    customer_id: str
    mrr: Decimal
    kind: str  # "voluntary" or "involuntary"
    method: str  # how `kind` was decided, see classify_churn


@dataclass
class MonthMetrics:
    month: str
    primary_currency: str
    multi_currency: bool
    mrr_start: Decimal
    mrr_end: Decimal
    customers_start: int
    customers_churned: int
    logo_churn_rate: Optional[Decimal]
    churned_mrr: Decimal
    voluntary_churned_mrr: Decimal
    involuntary_churned_mrr: Decimal
    revenue_churn_rate: Optional[Decimal]
    contraction_mrr: Decimal
    expansion_mrr: Decimal
    new_mrr: Decimal
    paused_customers: int
    reactivations: int
    failed_invoices: int
    recovered_invoices: int
    open_failed_invoices: int  # 30-day window not closed yet; left out of the rate
    recovery_rate: Optional[Decimal]
    failed_payment_mrr_at_risk: Decimal
    trials_ended: int
    trials_converted: int
    trial_to_paid_rate: Optional[Decimal]
    peer_recovery_rate: Decimal
    save_rate: Decimal
    recoverable_voluntary: Decimal
    recoverable_failed_payments: Decimal
    recoverable_revenue: Decimal
    churned: list[ChurnedSubscription] = field(default_factory=list)
    classification_methods: dict[str, int] = field(default_factory=dict)


def _ratio(num, den) -> Optional[Decimal]:
    return None if den == 0 else Decimal(num) / Decimal(den)


def _unpaid(inv: Invoice) -> bool:
    return inv.status != "paid" and inv.amount_due > 0 and inv.amount_paid < inv.amount_due


def classify_churn(sub: Subscription, invoices: list[Invoice]) -> tuple[str, str]:
    """Voluntary or involuntary, plus the method used to decide."""
    reason = sub.cancellation_reason
    if reason in config.VOLUNTARY_REASONS:
        return "voluntary", "stripe_reason"
    if reason in config.INVOLUNTARY_REASONS:
        return "involuntary", "stripe_reason"
    # No usable reason: look at the last invoice issued before it ended.
    ended = sub.ended_at
    own = [i for i in invoices if i.subscription_id == sub.id and (ended is None or i.created <= ended)]
    if not own:
        return "voluntary", "no_invoice_default"
    final = max(own, key=lambda i: i.created)
    if _unpaid(final):
        return "involuntary", "final_invoice_unpaid"
    return "voluntary", "final_invoice_paid"


def compute_month(
    ds: Dataset,
    month: str,
    as_of: datetime,
    primary: Optional[str] = None,
    peer_recovery_rate: Optional[Decimal] = None,
    save_rate: Decimal = config.SAVE_RATE,
) -> MonthMetrics:
    primary = primary or primary_currency(ds)
    peer = peer_recovery_rate if peer_recovery_rate is not None else config.DEFAULT_PEER_RECOVERY_RATE
    ms, me = month_bounds(month)
    eom = min(me, as_of) - TINY  # last instant of the month we can see

    start_by_cust = customer_mrr_at(ds, ms, primary)
    end_by_cust = customer_mrr_at(ds, eom, primary)
    mrr_start = sum(start_by_cust.values(), ZERO)
    mrr_end = sum(end_by_cust.values(), ZERO)

    subs_by_cust: dict[str, list[Subscription]] = defaultdict(list)
    for s in ds.subscriptions:
        subs_by_cust[s.customer_id].append(s)

    # --- Cancelled subscriptions and reactivations
    # DECISION: if the same customer starts another subscription in the same
    # month and is paying on it at month end, the cancellation is a
    # reactivation or plan switch, not churn. Its MRR change shows up as
    # expansion or contraction instead.
    churned: list[ChurnedSubscription] = []
    reactivations = 0
    for s in ds.subscriptions:
        if s.ended_at is None or not (ms <= s.ended_at < me) or s.ended_at > as_of:
            continue
        lost = subscription_mrr(s, s.ended_at - TINY, ds, primary)
        if lost <= 0:
            continue  # was trialing, paused or fully discounted
        replaced = any(
            o.id != s.id and ms <= o.start < me and subscription_mrr(o, eom, ds, primary) > 0
            for o in subs_by_cust[s.customer_id]
        )
        if replaced:
            reactivations += 1
            continue
        kind, method = classify_churn(s, ds.invoices)
        churned.append(ChurnedSubscription(s.id, s.customer_id, lost, kind, method))

    churned_mrr = sum((c.mrr for c in churned), ZERO)
    vol = sum((c.mrr for c in churned if c.kind == "voluntary"), ZERO)
    invol = churned_mrr - vol
    methods: dict[str, int] = defaultdict(int)
    for c in churned:
        methods[c.method] += 1

    # --- Logo churn: paying at the start, no live non-trial subscription at the end.
    # DECISION: a paused customer, or one on a 100% discount, still has a live
    # subscription, so they are not churned. Paused customers are counted.
    churned_customers = 0
    paused_customers = 0
    for cust in start_by_cust:
        live = [s for s in subs_by_cust[cust] if is_live(s, eom) and not is_trialing(s, eom)]
        if not live:
            churned_customers += 1
        elif cust not in end_by_cust and any(is_paused(s, eom) for s in live):
            paused_customers += 1

    # --- Expansion and contraction for customers paying at the start.
    churned_by_cust: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for c in churned:
        churned_by_cust[c.customer_id] += c.mrr
    expansion = contraction = ZERO
    for cust, start_v in start_by_cust.items():
        end_v = end_by_cust.get(cust, ZERO)
        live = [s for s in subs_by_cust[cust] if is_live(s, eom)]
        if end_v == 0 and any(is_paused(s, eom) for s in live):
            continue  # paused, reported separately
        movement = end_v - start_v + churned_by_cust[cust]  # churn is not contraction
        if movement > 0:
            expansion += movement
        else:
            contraction += -movement
    new_mrr = sum((v for c, v in end_by_cust.items() if c not in start_by_cust), ZERO)

    # --- Failed-payment recovery (30-day window from the first failed attempt)
    window = timedelta(days=config.RECOVERY_WINDOW_DAYS)
    failed = [i for i in ds.invoices if i.first_failed_at and ms <= i.first_failed_at < me]
    recovered = lost_inv = open_inv = 0
    for inv in failed:
        deadline = inv.first_failed_at + window
        if inv.paid_at is not None and inv.paid_at <= deadline:
            recovered += 1
        elif inv.paid_at is None and deadline > as_of and inv.status not in ("void", "uncollectible"):
            open_inv += 1
        else:
            lost_inv += 1
    recovery_rate = _ratio(recovered, recovered + lost_inv)

    subs_by_id = {s.id: s for s in ds.subscriptions}
    at_risk = ZERO
    seen: set[str] = set()
    for inv in sorted(failed, key=lambda i: i.first_failed_at):
        s = subs_by_id.get(inv.subscription_id or "")
        if s is None or s.id in seen:
            continue
        seen.add(s.id)
        at_risk += subscription_mrr(s, inv.first_failed_at, ds, primary)

    # --- Trial to paid
    # DECISION: a trial cancelled early ends when the subscription ends.
    # Converted means a paid invoice above zero on or after the trial end.
    trials_ended = trials_converted = 0
    for s in ds.subscriptions:
        if s.trial_end is None:
            continue
        trial_over = min(s.trial_end, s.ended_at) if s.ended_at else s.trial_end
        if not (ms <= trial_over < me) or trial_over > as_of:
            continue
        trials_ended += 1
        if any(
            i.subscription_id == s.id and i.amount_paid > 0 and i.created >= s.trial_end
            for i in ds.invoices
        ):
            trials_converted += 1

    # --- Recoverable revenue estimate
    rec_vol = vol * save_rate
    if recovery_rate is None:
        rec_fail = ZERO  # no closed failures yet, nothing to compare
    else:
        rec_fail = at_risk * max(ZERO, peer - recovery_rate)

    return MonthMetrics(
        month=month,
        primary_currency=primary,
        multi_currency=is_multi_currency(ds),
        mrr_start=mrr_start,
        mrr_end=mrr_end,
        customers_start=len(start_by_cust),
        customers_churned=churned_customers,
        logo_churn_rate=_ratio(churned_customers, len(start_by_cust)),
        churned_mrr=churned_mrr,
        voluntary_churned_mrr=vol,
        involuntary_churned_mrr=invol,
        revenue_churn_rate=None if mrr_start == 0 else churned_mrr / mrr_start,
        contraction_mrr=contraction,
        expansion_mrr=expansion,
        new_mrr=new_mrr,
        paused_customers=paused_customers,
        reactivations=reactivations,
        failed_invoices=len(failed),
        recovered_invoices=recovered,
        open_failed_invoices=open_inv,
        recovery_rate=recovery_rate,
        failed_payment_mrr_at_risk=at_risk,
        trials_ended=trials_ended,
        trials_converted=trials_converted,
        trial_to_paid_rate=_ratio(trials_converted, trials_ended),
        peer_recovery_rate=peer,
        save_rate=save_rate,
        recoverable_voluntary=rec_vol,
        recoverable_failed_payments=rec_fail,
        recoverable_revenue=rec_vol + rec_fail,
        churned=churned,
        classification_methods=dict(methods),
    )


def mrr_trend(ds: Dataset, month: str, as_of: datetime, count: int = 12,
              primary: Optional[str] = None) -> list[tuple[str, Decimal]]:
    """MRR at the end of each of the last `count` months, oldest first."""
    primary = primary or primary_currency(ds)
    out = []
    for m in months_back(month, count):
        _, me = month_bounds(m)
        out.append((m, mrr_at(ds, min(me, as_of) - TINY, primary)))
    return out


def within_tolerance(ours: Decimal, theirs: Decimal,
                     tolerance: Decimal = config.MATCH_TOLERANCE) -> bool:
    """Phase 0 reconciliation check against the founder's Stripe dashboard."""
    if theirs == 0:
        return ours == 0
    return abs(ours - theirs) / abs(theirs) <= tolerance
