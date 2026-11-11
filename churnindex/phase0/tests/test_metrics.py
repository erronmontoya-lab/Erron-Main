"""Tests for every metric in brief section 8 and every listed edge case."""

from decimal import Decimal as D

import pytest

from helpers import disc, ds, dt, inv, item, sub
from scorecard import metrics as m

AS_OF = dt("2026-11-15")
OCT = "2026-10"


def month(data, **kw):
    return m.compute_month(data, OCT, AS_OF, **kw)


# ------------------------------------------------------------- date helpers

def test_add_months_clamps_to_month_end():
    assert m.add_months(dt("2026-01-31"), 1) == dt("2026-02-28")
    assert m.add_months(dt("2026-11-15"), 2) == dt("2027-01-15")


def test_months_back():
    assert m.months_back("2026-02", 3) == ["2025-12", "2026-01", "2026-02"]


# ---------------------------------------------------- MRR normalization

@pytest.mark.parametrize("amount,interval,count,expected", [
    (30, "month", 1, D(30)),
    (120, "year", 1, D(10)),          # annual plans: / 12
    (12, "week", 1, D(52)),           # weekly: x 52 / 12
    (90, "month", 3, D(30)),          # quarterly
])
def test_item_monthly_amount(amount, interval, count, expected):
    assert m.item_monthly_amount(item(amount, interval, interval_count=count)) == expected


def test_quantity_multiplies():
    assert m.item_monthly_amount(item(10, quantity=5)) == D(50)


def test_mrr_excludes_trial_until_it_ends():
    s = sub(amount=50, start="2026-10-01", trial_end="2026-10-15")
    data = ds([s])
    assert m.mrr_at(data, dt("2026-10-10"), "usd") == 0
    assert m.mrr_at(data, dt("2026-10-20"), "usd") == D(50)


def test_incomplete_subscription_never_counts():
    s = sub(amount=50, status="incomplete_expired")
    assert m.mrr_at(ds([s]), dt("2026-10-10"), "usd") == 0


# --------------------------------------------------------------- coupons

def test_once_coupon_does_not_reduce_mrr():
    s = sub(amount=100, discount=disc("once", percent=50))
    assert m.mrr_at(ds([s]), dt("2026-10-10"), "usd") == D(100)


def test_repeating_coupon_reduces_mrr_only_while_active():
    s = sub(amount=100, start="2026-01-01", discount=disc("repeating", percent=25, months=3))
    data = ds([s])
    assert m.mrr_at(data, dt("2026-02-15"), "usd") == D(75)
    assert m.mrr_at(data, dt("2026-04-01"), "usd") == D(100)


def test_forever_coupon_always_reduces_mrr():
    s = sub(amount=100, discount=disc("forever", percent=20))
    assert m.mrr_at(ds([s]), dt("2026-10-10"), "usd") == D(80)


def test_amount_off_coupon_on_annual_plan_is_normalized():
    s = sub(amount=1200, interval="year", discount=disc("forever", amount=120))
    assert m.mrr_at(ds([s]), dt("2026-10-10"), "usd") == D(90)


def test_full_discount_means_not_a_paying_customer():
    free = sub(customer="cus_free", amount=100, discount=disc("forever", percent=100))
    paid = sub(customer="cus_paid", amount=40)
    r = month(ds([free, paid]))
    assert r.mrr_start == D(40)
    assert r.customers_start == 1


# ------------------------------------------- churn, logo and revenue

def test_logo_and_revenue_churn_basic():
    a = sub(customer="a", amount=100)
    b = sub(customer="b", amount=50, ended="2026-10-12", reason="cancellation_requested")
    c = sub(customer="c", amount=50)
    d = sub(customer="d", amount=200)
    r = month(ds([a, b, c, d]))
    assert r.customers_start == 4
    assert r.customers_churned == 1
    assert r.logo_churn_rate == D("0.25")
    assert r.mrr_start == D(400)
    assert r.churned_mrr == D(50)
    assert r.revenue_churn_rate == D("0.125")
    assert r.mrr_end == D(350)


def test_cancel_at_period_end_next_month_is_not_churn_this_month():
    s = sub(amount=100, ended="2026-11-02", reason="cancellation_requested")
    r = month(ds([s]))
    assert r.customers_churned == 0 and r.churned_mrr == 0


def test_upgrade_mid_month_with_proration_is_expansion_not_churn():
    s = sub(items=[item(50, start="2026-01-01", end="2026-10-15"),
                   item(100, start="2026-10-15")])
    proration = inv(s, "2026-10-15", 25)  # one-time proration charge
    r = month(ds([s], [proration]))
    assert r.mrr_start == D(50)
    assert r.mrr_end == D(100)
    assert r.expansion_mrr == D(50)
    assert r.churned_mrr == 0 and r.customers_churned == 0


def test_downgrade_mid_month_is_contraction_not_churn():
    s = sub(items=[item(100, start="2026-01-01", end="2026-10-10"),
                   item(40, start="2026-10-10")])
    r = month(ds([s]))
    assert r.contraction_mrr == D(60)
    assert r.churned_mrr == 0
    assert r.revenue_churn_rate == 0


def test_multiple_subscriptions_cancel_one():
    keep = sub(customer="a", amount=100)
    drop = sub(customer="a", amount=30, ended="2026-10-20", reason="cancellation_requested")
    r = month(ds([keep, drop]))
    assert r.customers_start == 1
    assert r.customers_churned == 0       # still paying on the other one
    assert r.churned_mrr == D(30)         # the cancelled subscription is churn
    assert r.contraction_mrr == 0         # and is not double counted


def test_reactivation_in_same_month_is_not_churn():
    old = sub(customer="a", amount=50, ended="2026-10-05", reason="cancellation_requested")
    new = sub(customer="a", amount=50, start="2026-10-20")
    r = month(ds([old, new]))
    assert r.customers_churned == 0
    assert r.churned_mrr == 0
    assert r.reactivations == 1


def test_paused_subscription_is_not_mrr_and_not_churn():
    s = sub(customer="a", amount=80, pauses=[("2026-10-10", None)])
    other = sub(customer="b", amount=20)
    r = month(ds([s, other]))
    assert r.mrr_start == D(100)
    assert r.mrr_end == D(20)
    assert r.customers_churned == 0
    assert r.paused_customers == 1
    assert r.contraction_mrr == 0


def test_refund_does_not_change_mrr_or_churn():
    s = sub(amount=60)
    refunded = inv(s, "2026-10-01", 60)  # paid, later refunded in Stripe
    r = month(ds([s], [refunded]))
    assert r.mrr_start == D(60) and r.mrr_end == D(60)
    assert r.churned_mrr == 0 and r.failed_invoices == 0


def test_annual_plan_churn_counts_monthly_value():
    s = sub(amount=1200, interval="year", ended="2026-10-03", reason="cancellation_requested")
    r = month(ds([s]))
    assert r.churned_mrr == D(100)


def test_new_mrr():
    s = sub(customer="new", amount=70, start="2026-10-08")
    r = month(ds([s]))
    assert r.new_mrr == D(70)


# ------------------------------------------- voluntary vs involuntary

def test_classification_uses_stripe_reason():
    v = sub(customer="a", amount=10, ended="2026-10-05", reason="cancellation_requested")
    f = sub(customer="b", amount=20, ended="2026-10-05", reason="payment_failed")
    d = sub(customer="c", amount=30, ended="2026-10-05", reason="payment_disputed")
    r = month(ds([v, f, d]))
    assert r.voluntary_churned_mrr == D(10)
    assert r.involuntary_churned_mrr == D(50)
    assert r.classification_methods == {"stripe_reason": 3}


def test_classification_fallback_by_final_invoice():
    unpaid = sub(customer="a", amount=20, ended="2026-10-20")
    paid = sub(customer="b", amount=30, ended="2026-10-20")
    no_inv = sub(customer="c", amount=40, ended="2026-10-20")
    invoices = [
        inv(unpaid, "2026-09-01", 20),
        inv(unpaid, "2026-10-01", 20, status="open", failed="2026-10-01"),
        inv(paid, "2026-10-01", 30),
    ]
    r = month(ds([unpaid, paid, no_inv], invoices))
    kinds = {c.customer_id: (c.kind, c.method) for c in r.churned}
    assert kinds["a"] == ("involuntary", "final_invoice_unpaid")
    assert kinds["b"] == ("voluntary", "final_invoice_paid")
    assert kinds["c"] == ("voluntary", "no_invoice_default")


# --------------------------------------------- failed-payment recovery

def test_recovery_rate_and_window():
    s1, s2, s3, s4 = (sub(customer=c, amount=10) for c in "abcd")
    invoices = [
        inv(s1, "2026-10-02", 10, failed="2026-10-02", paid_at="2026-10-05"),   # recovered
        inv(s2, "2026-10-03", 10, failed="2026-10-03", paid_at="2026-11-10"),   # paid too late
        inv(s3, "2026-10-04", 10, status="uncollectible", failed="2026-10-04"),  # lost
        inv(s4, "2026-10-30", 10, status="open", failed="2026-10-30"),          # window still open
    ]
    r = month(ds([s1, s2, s3, s4], invoices))
    assert r.failed_invoices == 4
    assert r.recovered_invoices == 1
    assert r.open_failed_invoices == 1
    assert r.recovery_rate == D(1) / D(3)
    assert r.failed_payment_mrr_at_risk == D(40)


def test_at_risk_counts_each_subscription_once():
    s = sub(amount=25)
    invoices = [inv(s, "2026-10-02", 25, status="uncollectible", failed="2026-10-02"),
                inv(s, "2026-10-12", 25, status="uncollectible", failed="2026-10-12")]
    assert month(ds([s], invoices)).failed_payment_mrr_at_risk == D(25)


def test_no_failures_means_no_rate():
    assert month(ds([sub(amount=10)])).recovery_rate is None


# ---------------------------------------------------------- trial to paid

def test_trial_to_paid_with_and_without_payment_method():
    with_pm = sub(customer="a", amount=30, start="2026-09-25", trial_end="2026-10-09")
    no_pm = sub(customer="b", amount=30, start="2026-09-26", trial_end="2026-10-10",
                ended="2026-10-10", status="canceled")
    later = sub(customer="c", amount=30, start="2026-10-25", trial_end="2026-11-08")
    invoices = [inv(with_pm, "2026-09-25", 0), inv(with_pm, "2026-10-09", 30),
                inv(no_pm, "2026-09-26", 0)]
    r = month(ds([with_pm, no_pm, later], invoices))
    assert r.trials_ended == 2
    assert r.trials_converted == 1
    assert r.trial_to_paid_rate == D("0.5")
    assert r.customers_churned == 0      # an unconverted trial is not paid churn
    assert r.churned_mrr == 0


def test_trial_cancelled_early_counts_as_ended_then():
    s = sub(amount=30, start="2026-09-20", trial_end="2026-11-03", ended="2026-10-05")
    r = month(ds([s]))
    assert r.trials_ended == 1 and r.trials_converted == 0


# ----------------------------------------------------------- multi-currency

def test_multi_currency_converts_at_month_rate():
    usd = sub(customer="a", amount=100)
    eur = sub(customer="b", amount=100, currency="eur")
    fx = {("eur", "2026-10"): D("1.10")}
    r = month(ds([usd, eur], fx=fx), primary="usd")
    assert r.multi_currency is True
    assert r.mrr_start == D(210)


def test_missing_fx_rate_is_a_clear_error():
    usd = sub(customer="a", amount=100)
    eur = sub(customer="b", amount=50, currency="eur")
    with pytest.raises(m.MissingFxRate, match="eur"):
        month(ds([usd, eur]), primary="usd")


def test_primary_currency_is_largest():
    data = ds([sub(customer="a", amount=10), sub(customer="b", amount=500, currency="eur")])
    assert m.primary_currency(data) == "eur"


# -------------------------------------------------------- recoverable revenue

def test_recoverable_revenue_formula():
    vol = sub(customer="a", amount=100, ended="2026-10-10", reason="cancellation_requested")
    f1 = sub(customer="b", amount=200)
    f2 = sub(customer="c", amount=200)
    invoices = [
        inv(f1, "2026-10-02", 200, failed="2026-10-02", paid_at="2026-10-04"),
        inv(f2, "2026-10-02", 200, status="uncollectible", failed="2026-10-02"),
    ]
    r = month(ds([vol, f1, f2], invoices))
    # 100 x 0.30 + 400 x (0.55 - 0.50)
    assert r.recoverable_voluntary == D("30")
    assert r.recoverable_failed_payments == D("20")
    assert r.recoverable_revenue == D("50")


def test_recoverable_failed_part_is_zero_when_above_peer():
    s = sub(amount=200)
    invoices = [inv(s, "2026-10-02", 200, failed="2026-10-02", paid_at="2026-10-03")]
    r = month(ds([s], invoices))
    assert r.recovery_rate == 1
    assert r.recoverable_failed_payments == 0


def test_peer_rate_override():
    s = sub(amount=100)
    invoices = [inv(s, "2026-10-02", 100, status="uncollectible", failed="2026-10-02")]
    r = month(ds([s], invoices), peer_recovery_rate=D("0.70"))
    assert r.recoverable_failed_payments == D("70")


# -------------------------------------------------------------- trend and match

def test_mrr_trend():
    s = sub(amount=50, start="2026-09-10")
    t = m.mrr_trend(ds([s]), OCT, AS_OF, count=3)
    assert t == [("2026-08", 0), ("2026-09", D(50)), ("2026-10", D(50))]


@pytest.mark.parametrize("ours,theirs,ok", [
    (D("1000"), D("1015"), True),
    (D("1000"), D("1030"), False),
    (D("0"), D("0"), True),
])
def test_within_tolerance(ours, theirs, ok):
    assert m.within_tolerance(ours, theirs) is ok
