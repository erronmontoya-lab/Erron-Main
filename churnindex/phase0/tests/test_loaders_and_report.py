"""CSV loading, the PDF and the command line."""

from datetime import datetime
from decimal import Decimal as D

import pytest

from scorecard.__main__ import main
from scorecard.loaders import CsvFormatError, load_folder, parse_date, parse_money
from scorecard.metrics import compute_month, mrr_trend
from scorecard.report import build_pdf

SUBS = """id,Customer ID,Customer Email,Status,Amount,Interval,Quantity,Currency,Created (UTC),Trial End (UTC),Ended At (UTC),Cancellation Reason,Coupon
sub_a,cus_a,a@example.com,active,"$1,200.00",year,1,USD,2026-01-05 10:00,,,,
sub_b,cus_b,b@example.com,canceled,30.00,month,2,usd,2026-02-01 09:00,,2026-10-12 08:00,cancellation_requested,HALF
sub_c,cus_c,c@example.com,active,50.00,month,1,usd,2026-03-01 09:00,,,,MYSTERY
"""

INVOICES = """id,Customer,Subscription,Date (UTC),Currency,Amount Due,Amount Paid,Status
in_1,cus_c,sub_c,2026-10-01 09:00,usd,50.00,50.00,paid
in_2,cus_b,sub_b,2026-10-01 09:00,usd,60.00,60.00,paid
"""

CHARGES = """id,Created (UTC),Amount,Status,Invoice ID
ch_1,2026-10-01 09:00,50.00,failed,in_1
ch_2,2026-10-04 09:00,50.00,succeeded,in_1
ch_3,2026-10-01 09:00,60.00,succeeded,in_2
"""

COUPONS = """id,Percent Off,Amount Off,Duration,Duration In Months
HALF,50,,forever,
"""


@pytest.fixture
def account(tmp_path):
    (tmp_path / "subscriptions.csv").write_text(SUBS)
    (tmp_path / "invoices.csv").write_text(INVOICES)
    (tmp_path / "charges.csv").write_text(CHARGES)
    (tmp_path / "coupons.csv").write_text(COUPONS)
    return tmp_path


def test_parse_helpers():
    assert parse_money("$1,200.00") == D("1200.00")
    assert parse_money("") == 0
    assert parse_date("2026-10-01 09:00") == datetime(2026, 10, 1, 9)
    assert parse_date("2026-10-01T09:00:00Z") == datetime(2026, 10, 1, 9)
    assert parse_date("1790000000").year == 2026


def test_load_stripe_style_export(account):
    data = load_folder(account)
    subs = {s.id: s for s in data.subscriptions}
    assert subs["sub_a"].items[0].unit_amount == D("1200.00")
    assert subs["sub_a"].currency == "usd"
    assert subs["sub_b"].items[0].quantity == 2
    assert subs["sub_b"].discount.percent_off == D(50)
    assert subs["sub_b"].ended_at == datetime(2026, 10, 12, 8)
    assert subs["sub_c"].discount is None  # unknown coupon is reported, not guessed
    assert any("coupon" in n for n in data.notes)


def test_email_column_is_not_kept(account):
    data = load_folder(account)
    assert "example.com" not in repr(data)


def test_charges_give_failure_and_payment_times(account):
    invs = {i.id: i for i in load_folder(account).invoices}
    assert invs["in_1"].first_failed_at == datetime(2026, 10, 1, 9)
    assert invs["in_1"].paid_at == datetime(2026, 10, 4, 9)
    assert invs["in_2"].first_failed_at is None


def test_attempt_count_fallback_without_charges(tmp_path):
    (tmp_path / "subscriptions.csv").write_text(SUBS)
    (tmp_path / "invoices.csv").write_text(
        "id,Customer,Subscription,Date (UTC),Amount Due,Amount Paid,Status,Attempt Count\n"
        "in_9,cus_c,sub_c,2026-10-01 09:00,50,0,open,1\n")
    data = load_folder(tmp_path)
    assert data.invoices[0].first_failed_at == datetime(2026, 10, 1, 9)
    assert any("estimated" in n for n in data.notes)


def test_end_to_end_numbers(account):
    data = load_folder(account)
    r = compute_month(data, "2026-10", datetime(2026, 11, 10))
    # 1200/12 + 30 x 2 x 50% + 50
    assert r.mrr_start == D(180)
    assert r.churned_mrr == D(30)
    assert r.recovery_rate == 1


def test_missing_column_names_the_field(tmp_path):
    (tmp_path / "subscriptions.csv").write_text("id,Status\nsub_1,active\n")
    (tmp_path / "invoices.csv").write_text(INVOICES)
    with pytest.raises(CsvFormatError, match="customer_id"):
        load_folder(tmp_path)


def test_missing_file(tmp_path):
    with pytest.raises(CsvFormatError, match="subscriptions.csv"):
        load_folder(tmp_path)


def test_pdf_is_written(account, tmp_path):
    data = load_folder(account)
    as_of = datetime(2026, 11, 10)
    r = compute_month(data, "2026-10", as_of)
    out = build_pdf(r, mrr_trend(data, "2026-10", as_of), tmp_path / "x.pdf", "Test", data.notes, sample=True)
    assert out.read_bytes()[:4] == b"%PDF"


def test_cli(account, tmp_path, capsys):
    out = tmp_path / "s.pdf"
    code = main([str(account), "--month", "2026-10", "--as-of", "2026-11-10",
                 "--out", str(out), "--dashboard-mrr", "150"])
    text = capsys.readouterr().out
    assert code == 0 and out.exists()
    assert "MATCH" in text  # ours is 150 today


def test_cli_reports_bad_input(tmp_path, capsys):
    assert main([str(tmp_path)]) == 1
    assert "Could not build" in capsys.readouterr().err
