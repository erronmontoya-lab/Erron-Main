"""Plain data shapes the metrics engine works on.

Loaders turn CSV files (or, later, Stripe API responses) into these objects.
The metrics engine only ever sees these, so it does not care where data came
from. All money is in major units (dollars, not cents) as Decimal.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class Discount:
    """A coupon applied to a subscription.

    duration is Stripe's: "once", "repeating" or "forever". Only repeating
    (while it lasts) and forever discounts reduce MRR. A once coupon touches a
    single invoice, so it is a one-time discount and MRR ignores it.
    """

    duration: str
    percent_off: Optional[Decimal] = None
    amount_off: Optional[Decimal] = None  # per billing interval, major units
    duration_in_months: Optional[int] = None
    start: Optional[datetime] = None  # defaults to the subscription start


@dataclass(frozen=True)
class Item:
    """One priced line on a subscription for a span of time.

    A plan change (upgrade or downgrade) is modeled as one item ending and a
    new item starting at the same moment. `end` is exclusive; None means the
    item is still running.
    """

    unit_amount: Decimal  # price per interval, major units, before tax
    interval: str  # "day", "week", "month" or "year"
    start: datetime
    end: Optional[datetime] = None
    quantity: int = 1
    interval_count: int = 1


@dataclass
class Subscription:
    id: str
    customer_id: str
    currency: str
    status: str  # current Stripe status
    start: datetime
    items: list[Item]
    trial_end: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    discount: Optional[Discount] = None
    pauses: list[tuple[datetime, Optional[datetime]]] = field(default_factory=list)


@dataclass
class Invoice:
    id: str
    customer_id: str
    subscription_id: Optional[str]
    created: datetime
    currency: str
    amount_due: Decimal
    amount_paid: Decimal
    status: str  # draft, open, paid, uncollectible, void
    first_failed_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None


@dataclass
class Dataset:
    subscriptions: list[Subscription]
    invoices: list[Invoice]
    # (currency, "YYYY-MM") -> value of 1 unit of that currency in the primary
    # currency. Only needed when an account bills in more than one currency.
    fx_rates: dict[tuple[str, str], Decimal] = field(default_factory=dict)
    # Plain-language warnings from the loader, printed on the scorecard.
    notes: list[str] = field(default_factory=list)
