"""Write a made-up account in Stripe export format to sample_data/sample-app.

Everything this produces is SAMPLE data. No real customers.
Run: python make_sample_data.py
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

OUT = Path(__file__).parent / "sample_data" / "sample-app"
AS_OF = datetime(2026, 11, 10)
rng = random.Random(42)

PLANS = [("19.00", "month"), ("49.00", "month"), ("99.00", "month"), ("490.00", "year")]
fmt = lambda d: d.strftime("%Y-%m-%d %H:%M") if d else ""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    subs, invoices, charges = [], [], []
    for n in range(320):
        cus = f"cus_sample{n:04d}"
        sid = f"sub_sample{n:04d}"
        start = datetime(2025, 5, 1) + timedelta(days=rng.randint(0, 550), hours=rng.randint(0, 23))
        if start >= AS_OF:
            continue
        amount, interval = rng.choices(PLANS, weights=[4, 5, 2, 2])[0]
        trial_end = start + timedelta(days=14) if rng.random() < 0.4 else None
        coupon = "LAUNCH20" if rng.random() < 0.15 else ""
        status, ended, reason = "active", None, ""
        # Trials without conversion end at the trial end.
        if trial_end and rng.random() < 0.45:
            ended, status, reason = trial_end, "canceled", "cancellation_requested"
        elif rng.random() < 0.035 * max(1, (AS_OF - start).days / 30) and interval == "month":
            ended = start + timedelta(days=rng.randint(20, max(21, (AS_OF - start).days)))
            if ended < AS_OF:
                status = "canceled"
                reason = rng.choices(["cancellation_requested", "payment_failed", ""], [6, 3, 1])[0]
            else:
                ended = None
        if ended and ended >= AS_OF:
            ended, status = None, "active"
        if status == "active" and trial_end and trial_end > AS_OF:
            status = "trialing"
        subs.append({
            "id": sid, "Customer ID": cus, "Customer Email": "", "Status": status,
            "Amount": amount, "Interval": interval, "Quantity": "1", "Currency": "usd",
            "Created (UTC)": fmt(start), "Start Date (UTC)": fmt(start),
            "Trial End (UTC)": fmt(trial_end), "Canceled At (UTC)": fmt(ended),
            "Ended At (UTC)": fmt(ended), "Cancellation Reason": reason, "Coupon": coupon,
        })

        # Invoices on each billing date after the trial.
        step = 30 if interval == "month" else 365
        t = trial_end or start
        last = ended or AS_OF
        k = 0
        while t < last:
            iid = f"in_{sid}_{k}"
            k += 1
            fails = rng.random() < 0.08
            final_bad = reason == "payment_failed" and t + timedelta(days=step) >= last
            if final_bad:
                invoices.append(_inv(iid, cus, sid, t, amount, "0.00", "uncollectible"))
                charges.append(_ch(iid, t, amount, "failed"))
            elif fails:
                recovered = rng.random() < 0.45
                charges.append(_ch(iid, t, amount, "failed"))
                if recovered:
                    paid_at = t + timedelta(days=rng.randint(1, 12))
                    charges.append(_ch(iid, paid_at, amount, "succeeded"))
                    invoices.append(_inv(iid, cus, sid, t, amount, amount, "paid"))
                else:
                    invoices.append(_inv(iid, cus, sid, t, amount, "0.00",
                                         "open" if AS_OF - t < timedelta(days=30) else "uncollectible"))
            else:
                invoices.append(_inv(iid, cus, sid, t, amount, amount, "paid"))
                charges.append(_ch(iid, t, amount, "succeeded"))
            t += timedelta(days=step)

    _write("subscriptions.csv", subs)
    _write("invoices.csv", invoices)
    _write("charges.csv", charges)
    _write("coupons.csv", [{"id": "LAUNCH20", "Percent Off": "20", "Amount Off": "",
                            "Duration": "repeating", "Duration In Months": "3"}])
    print(f"Wrote sample account to {OUT}")


def _inv(iid, cus, sid, t, due, paid, status):
    return {"id": iid, "Customer": cus, "Subscription": sid, "Date (UTC)": fmt(t),
            "Currency": "usd", "Amount Due": due, "Amount Paid": paid, "Status": status}


def _ch(iid, t, amount, status):
    return {"id": f"ch_{iid}_{t:%m%d}", "Created (UTC)": fmt(t), "Amount": amount,
            "Status": status, "Invoice ID": iid}


def _write(name, rows):
    with open(OUT / name, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
