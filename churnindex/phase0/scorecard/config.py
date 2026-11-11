"""Every tunable number and name lives here, so it can change in one place."""

from decimal import Decimal

# Working name. Not yet checked for trademark or domain (brief section 14).
BRAND_NAME = "ChurnIndex"

# Share of voluntarily churned MRR we assume a good cancel flow can save.
SAVE_RATE = Decimal("0.30")

# Failed-payment recovery rate we compare against when no peer cohort exists.
# Source: Stripe's published average for its recovery tools.
DEFAULT_PEER_RECOVERY_RATE = Decimal("0.55")

# Days after the first failed attempt that an invoice has to be paid to count
# as recovered.
RECOVERY_WINDOW_DAYS = 30

# How close our numbers must be to the founder's Stripe dashboard to count as
# a match in Phase 0 (0.02 means within 2 percent).
MATCH_TOLERANCE = Decimal("0.02")

# Stripe cancellation_details.reason values.
VOLUNTARY_REASONS = {"cancellation_requested"}
INVOLUNTARY_REASONS = {"payment_failed", "payment_disputed"}

# Subscription statuses that never became a real subscription.
NEVER_STARTED_STATUSES = {"incomplete", "incomplete_expired"}
