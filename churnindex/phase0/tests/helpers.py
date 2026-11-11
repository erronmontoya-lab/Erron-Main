"""Small builders so each test reads like a sentence."""

from datetime import datetime
from decimal import Decimal as D

from scorecard.models import Dataset, Discount, Invoice, Item, Subscription

_n = {"sub": 0, "inv": 0}


def dt(s: str) -> datetime:
    return datetime.fromisoformat(s)


def item(amount, interval="month", start="2026-01-01", end=None, quantity=1, interval_count=1):
    return Item(D(str(amount)), interval, dt(start), dt(end) if end else None, quantity, interval_count)


def sub(customer="cus_1", amount=None, items=None, start="2026-01-01", ended=None,
        reason=None, trial_end=None, currency="usd", status=None, discount=None,
        pauses=None, interval="month", sid=None):
    _n["sub"] += 1
    if items is None:
        items = [item(amount, interval, start)]
    return Subscription(
        id=sid or f"sub_{_n['sub']}",
        customer_id=customer,
        currency=currency,
        status=status or ("canceled" if ended else "active"),
        start=dt(start),
        items=items,
        trial_end=dt(trial_end) if trial_end else None,
        ended_at=dt(ended) if ended else None,
        cancellation_reason=reason,
        discount=discount,
        pauses=[(dt(a), dt(b) if b else None) for a, b in (pauses or [])],
    )


def inv(s, created, due, paid=None, status="paid", failed=None, paid_at=None):
    _n["inv"] += 1
    paid = due if paid is None and status == "paid" else (paid or 0)
    return Invoice(
        id=f"in_{_n['inv']}",
        customer_id=s.customer_id,
        subscription_id=s.id,
        created=dt(created),
        currency=s.currency,
        amount_due=D(str(due)),
        amount_paid=D(str(paid)),
        status=status,
        first_failed_at=dt(failed) if failed else None,
        paid_at=dt(paid_at) if paid_at else (dt(created) if status == "paid" and not failed else None),
    )


def ds(subs, invoices=(), fx=None):
    return Dataset(list(subs), list(invoices), fx or {})


def disc(duration, percent=None, amount=None, months=None, start=None):
    return Discount(duration, D(str(percent)) if percent is not None else None,
                    D(str(amount)) if amount is not None else None, months,
                    dt(start) if start else None)
