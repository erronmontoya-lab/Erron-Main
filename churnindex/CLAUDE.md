# ChurnIndex: Project Brief for Claude Code

This file is the single source of context for building ChurnIndex. Read it fully before writing code. When something here conflicts with a later instruction from Erron, Erron wins; update this file to match.

---

## 1. What we are building

**One sentence:** A founder connects Stripe and instantly sees how much revenue their subscription app loses to churn each month, how much is recoverable, and how they compare with similar apps. Then they can switch on Autopilot to win that revenue back.

**Three layers that compound:**

1. **Free Scorecard (acquisition loop and data moat).** Read-only Stripe connection. Shows voluntary vs involuntary churn, failed-payment recovery rate, trial-to-paid, recoverable revenue per month, and percentiles against peer apps. Every connection improves the benchmark.
2. **Paid Autopilot (revenue).** Reason-matched cancel flows, failed-payment recovery emails, win-back sequences, and a recovered-revenue report. Offer choices are informed by outcomes across the whole index.
3. **State of Churn (owned media and distribution).** Weekly newsletter and quarterly report built from anonymized index data.

**Working name:** ChurnIndex. Name, domain and trademark are NOT yet checked. Keep the brand name in one config constant so it can change in one place.

**Homepage design mock (source of truth for marketing site look and copy):** https://claude.ai/artifact/Gn4noDFLqfyxiVbKbhrHDh

---

## 2. Why this exists (strategy context)

- **Problem:** Small subscription apps leak revenue through cancellations and failed payments, and almost none have a retention function. Premium retention tools start around $250 a month, which prices out the long tail.
- **Evidence (from research, Nov 2026):**
  - RevenueCat State of Subscription Apps 2026: AI apps have 21.1% annual retention vs 30.7% for non-AI apps; over half of trial cancellations happen on day zero; roughly 15,000 new subscription apps launch each month.
  - Stripe research: about 25% of churn is involuntary (failed payments). Stripe says its tools recover about 55% of failed payments on average.
  - Precedent: ProfitWell gave metrics away free, monetized through Retain, and sold to Paddle for $200M+ in 2022.
- **Moat:** Cross-company outcome data (which offer works for which cancel reason at which price point), across billing providers. Model companies (OpenAI, Anthropic, Google) have no access to billing events. Billing providers will not benchmark across competitors.
- **Main threats:** Stripe shipping reason-matched offers plus peer benchmarks; Churnkey launching a low-price tier; app builders (Lovable, Bolt) shipping native retention.
- **Key survival metric:** 500 connected accounts within 9 months. Below that the benchmark is thin and the product is a commodity cancel screen.

---

## 3. Target customers

- **Paying customers first (priority):** Stripe-billed SaaS and subscription apps at roughly **$10K to $150K MRR**. Indie and small B2B SaaS, newsletters and paid communities, AI tools, fitness and wellness subscriptions. Recovered dollars at this size justify $49 to $149 a month.
- **Free Scorecard audience and report narrative:** AI-built apps (Lovable, Bolt, Replit, Cursor) and smaller apps. They feed the benchmark and the share-card loop but are not the revenue base.
- **Buyer:** the founder, on a credit card. No procurement. Same-day to two-week sales cycle.

---

## 4. The founder and how to work with him

- **Erron Montoya**, solo founder. 14+ years in growth, lifecycle, PLG, demand gen and product marketing (formerly Customer Retention Lead at AWS; lifecycle lead at [solidcore]; demand gen at Grammarly for Business; Head of Integrated Marketing at Mural; Sr. Director of Marketing at Alignable).
- **Not a software engineer.** Reads SQL, does not write it from scratch. Building with Claude Code and Lovable.
- **Working rules for Claude Code:**
  - Explain decisions in plain language, briefly. Lead with what you did and what he needs to do next.
  - Prefer boring, well-documented tools. Ask before adding a new dependency or service.
  - Use Stripe **test mode** keys and seeded test data for all development.
  - Never store secrets in code or commit them. Use environment variables and Supabase Vault.
  - Write tests for every metric calculation and every action that changes billing. No exceptions.
  - Flag anything that needs a human engineer's review (see section 11).
  - Keep scope tight. If a request adds scope to the current phase, say so and suggest where it belongs.
- **Copy rules (all user-facing text):** no em dashes or en dashes; no irony or litotes; state things directly and positively; no invented stats or testimonials; label any sample data as sample.

---

## 5. Build phases, scope and acceptance criteria

Assumes about 25 founder hours a week. Contract engineer budget about 40 to 80 hours ($5K to $10K) across Phases 1 and 2.

### Phase 0: Manual scorecards (target: Nov 20, 2026)
- Not a product build. A local script or notebook that takes a Stripe CSV export or a read-only test key and produces the scorecard metrics, so Erron can email a PDF to founders.
- **Done means:** 10 real accounts scored; each founder confirms the numbers match their own Stripe dashboard within an acceptable tolerance.
- **Why:** validates demand and the churn math before any public product.
- **Decided (Nov 11, 2026):** CSV exports first (read-only key route later if needed); Python with pytest and fpdf2; "match" means within 2% of the founder's Stripe dashboard. Code lives in `churnindex/phase0/`; see its README.

### Phase 1: Free Scorecard (target: Dec 11, 2026)
In scope:
- Marketing site (match the homepage mock).
- Sign up and sign in (Supabase Auth, email magic link plus Google).
- Connect Stripe with a **restricted, read-only key** (see section 7).
- Initial backfill of up to 24 months of history; nightly incremental sync.
- Metrics engine (section 8) with tests against fixture data.
- Scorecard page: recoverable revenue, voluntary churn, failed-payment churn, recovery rate, trial-to-paid, MRR trend. Show peer comparison only when a cohort meets the anonymity threshold; otherwise show "benchmark building" state.
- Share card: image and link showing **recoverable revenue only** (never churn rate or percentile).
- Disconnect and delete all data in one click.
- Product analytics events (section 10).

Out of scope for Phase 1: any write action to Stripe, cancel flows, emails to end customers, other billing providers, paid plans.

**Done means:** a founder can go from homepage to a correct scorecard in under 5 minutes using a real read-only key; numbers reconcile with the Stripe dashboard on the Phase 0 accounts; deleting an account removes all its rows and its stored key.

### Phase 2: Autopilot v1 (target: Jan 25, 2027)
In scope:
- Paid plans via Stripe Checkout and Customer Portal for ChurnIndex itself ($49 Autopilot, $149 Growth).
- Hosted cancel flow: an embeddable script or hosted page the customer links their cancel button to. Asks for a reason, shows one matched offer (pause, discount, downgrade), and always shows a visible cancel button.
- Failed-payment recovery emails timed around Stripe retries, with a hosted card-update link (Stripe Customer Portal or Checkout setup mode).
- Billing write actions: apply coupon, pause subscription, cancel subscription. Requires elevated permissions granted only for the actions the customer switches on.
- Action log with idempotency keys for every write.
- Recovered revenue ledger and monthly report.
- Webhook ingestion for real-time events.

Out of scope for Phase 2: SMS, win-back sequences beyond a basic single email, offer A/B testing, non-Stripe providers.

**Done means:** in Stripe test mode, an end customer can start a cancel, see an offer, accept it, and the subscription changes exactly once; a failed payment triggers the email sequence and a successful card update stops it; all writes appear in the action log; an engineer has reviewed write actions and webhooks.

### Phase 3: Benchmark and report (target: Feb 22, 2027)
- Cohort assignment, percentile computation, anonymity enforcement.
- Internal tool to export anonymized aggregates for the State of Churn report.
- Newsletter runs on beehiiv; the app only syncs report signups.

**Done means:** no cohort with fewer than the minimum number of apps is ever displayed or exported; percentiles recompute nightly.

### Phase 4: After about $20K MRR (not now)
Win-back sequences, SMS recovery (requires US carrier 10DLC registration), offer testing against the index, Paddle, Lemon Squeezy and RevenueCat connectors, Stripe App Marketplace listing, SOC 2, first engineer hire.

---

## 6. Recommended stack

| Layer | Choice | Notes |
|---|---|---|
| Front end | React, TypeScript, Vite, Tailwind | Lovable compatible |
| Backend and database | Supabase (Postgres, Auth, Edge Functions, pg_cron, Storage, Vault) | Row level security on every table |
| Secret storage | Supabase Vault | Encrypt Stripe keys at rest; never return them to the client |
| Billing data | Stripe API (customer data) | Read-only restricted key in Phase 1 |
| Own billing | Stripe Checkout and Customer Portal | Phase 2 |
| Email | Resend | Transactional and recovery emails |
| AI | Anthropic Claude API | Drafting cancel-reason copy and email variants; never for metric math |
| Newsletter | beehiiv | Report and weekly email |
| Product analytics | PostHog | Events in section 10 |
| Errors | Sentry | Front end and edge functions |
| Share card images | Server-side image generation (e.g. Satori or a Supabase function) | |

---

## 7. Stripe integration

**Phase 1 connection:** the founder creates a restricted key in their Stripe dashboard with **read** access to: Customers, Subscriptions, Invoices, Charges, Payment Intents, Products, Prices, Coupons, Events. Provide a step-by-step guide with screenshots in onboarding. Validate the key on submit by making one call per resource; reject keys with write access in Phase 1.

**Sync:**
- Backfill: paginate list endpoints (subscriptions with `status=all`, invoices, charges, customers) for up to 24 months. Respect rate limits with backoff.
- Incremental: nightly job using `created` and `updated` filters plus the Events API (events are only retained 30 days, so nightly runs must not lapse).
- Store raw objects minimally: keep only fields the metrics need. Do not store card details, addresses or end-customer emails in Phase 1.

**Phase 2 connection:** write actions and webhooks need more than a read-only key. **Open decision:** Stripe Connect OAuth or a Stripe App vs a second restricted key with specific write permissions. Recommend a Stripe App or Connect for trust and for webhook delivery; confirm with the contract engineer before building.

---

## 8. Metric definitions (must be tested)

All metrics are computed per connected account, per calendar month, in the account's primary currency (convert others at the invoice date rate; flag multi-currency accounts).

- **MRR:** sum of active, non-trial subscription item amounts normalized to monthly (annual / 12, weekly × 52 / 12), net of recurring discounts, excluding tax and one-time charges.
- **Customers at start of month:** customers with at least one active paid subscription at 00:00 on day 1.
- **Logo churn rate:** customers who went from active paid to zero active paid subscriptions during the month ÷ customers at start of month.
- **Revenue churn rate:** MRR lost from fully cancelled subscriptions ÷ MRR at start of month. (Contraction from downgrades is tracked separately, not counted as churn.)
- **Voluntary vs involuntary:** use Stripe `subscription.cancellation_details.reason`. `cancellation_requested` = voluntary. `payment_failed` and `payment_disputed` = involuntary. Unknown or missing = classify by whether the final invoice was unpaid; record the classification method.
- **Failed-payment recovery rate:** invoices with at least one failed payment attempt in the window that were later paid ÷ all invoices with at least one failed attempt in the window. Use a 30-day recovery window.
- **Trial-to-paid rate:** trials that ended in the month and converted to a paid invoice ÷ trials that ended in the month.
- **Recoverable revenue per month (estimate):**
  - `voluntary_churned_MRR × SAVE_RATE` (default 0.30)
  - plus `failed_payment_MRR_at_risk × max(0, PEER_RECOVERY_RATE − your_recovery_rate)`
  - `PEER_RECOVERY_RATE` = cohort median when available, else 0.55 (Stripe's published average).
  - Both constants live in config and are shown to the user as assumptions.

**Edge cases tests must cover:** prorations, upgrades and downgrades mid-month, coupons (once, repeating, forever), 100% discounts, paused subscriptions, refunds, annual plans, multiple subscriptions per customer, reactivations within the same month, trials with and without payment method, multi-currency.

---

## 9. Benchmark and anonymity

- **Cohort dimensions:** monthly ARPU band (under $10, $10 to $20, $20 to $40, $40 to $100, over $100), billing cadence mix (mostly monthly vs mostly annual), MRR band, category (self-reported), build stack (self-reported).
- **Anonymity threshold:** never display or export a cohort statistic with fewer than **K apps** in it. Default K = 10. **Open decision for Erron.** Fall back to a broader cohort (drop dimensions in a fixed order) until K is met.
- Show percentiles and medians only. Never another app's name or raw numbers.
- Terms of service must state that anonymized, aggregated data is used for benchmarks and the report.

---

## 10. Product analytics events (PostHog)

`homepage_viewed`, `calculator_used`, `signup_started`, `signup_completed`, `stripe_key_submitted`, `stripe_key_validated`, `backfill_completed`, `scorecard_viewed`, `share_card_created`, `share_card_clicked` (with referrer), `report_signup`, `plan_checkout_started`, `plan_activated`, `autopilot_enabled`, `cancel_flow_shown`, `offer_accepted`, `cancel_completed`, `recovery_email_sent`, `payment_recovered`, `account_deleted`.

**North-star for Phase 1:** connected accounts with a completed scorecard. **For Phase 2:** recovered revenue per paying account vs plan price.

---

## 11. Security, legal and what needs a human engineer

**Security requirements:**
- Stripe keys encrypted in Supabase Vault; decrypted only inside server functions; never logged; never sent to the browser.
- Row level security on every table, scoped to the account.
- One-click disconnect deletes the key and all synced data.
- All billing write actions use idempotency keys and are written to an append-only action log.

**Legal and compliance:**
- Cancel flows must keep a clear cancel option visible on every screen. Design to California's automatic renewal law (AB 2863, effective July 1, 2025), which allows retention offers only when a click-to-cancel option is shown at the same time. No dark patterns.
- The FTC click-to-cancel rule was vacated in July 2025; the FTC still enforces under ROSCA and Section 5. Treat honest cancellation as a product requirement.
- Privacy policy and terms must cover benchmark aggregation and data deletion.

**Requires review by a paid engineer before launch:**
1. The metrics engine and its tests (Phase 1).
2. Key storage and the read-only key validation (Phase 1).
3. All Stripe write actions, webhook handling and retries (Phase 2).
4. The embeddable cancel-flow script (Phase 2).
5. Anonymity enforcement (Phase 3).

---

## 12. Pricing (from homepage)

| Plan | Price | Includes |
|---|---|---|
| Scorecard | Free | Metrics, percentiles, recoverable revenue estimate, share card |
| Autopilot | $49 a month | Scorecard plus reason-matched cancel flow, failed-payment emails, monthly recovered revenue report |
| Growth | $149 a month | Autopilot plus win-back sequences, SMS recovery, offer testing (Phase 4 features; show as coming soon until built) |
| Retention Sprint | $1,500 setup plus 15% of recovered revenue for 90 days | Done-for-you setup, delivered manually by Erron |

Proposed guarantee on the homepage (pending Erron's decision): if Autopilot recovers less than its price in the first 60 days, the next month is free.

---

## 13. Marketing site (match the mock)

Section order: announcement bar, nav, dark hero with sample scorecard, compatibility strip (Stripe live; Paddle, Lemon Squeezy, RevenueCat next), three leaks with sourced stats, interactive churn calculator, how it works (Connect, Compare, Recover), the index with illustrative save-rate table, share card, Autopilot features, comparison table, State of Churn signup, pricing plus guarantee plus Retention Sprint, founder section, security and data use, FAQ, final CTA, footer.

Design tokens from the mock: ink `#0B1220`, raised dark `#131C2E`, dark border `#26324A`, page `#F5F7FA`, border `#DFE4EB`, muted text `#4A5568`, muted on dark `#AEB8C9`, accent `#FF6B2C` (always with ink text, never white), data blue `#5B8CFF` on dark and `#1F4FE0` on light. Fonts: Bricolage Grotesque for headings, Inter for body. Primary CTA everywhere: "Get my free scorecard".

Calculator logic: lost = MRR × churn rate; 25% of lost attributed to failed payments; recoverable = lost × 0.30. Show assumptions on the page.

---

## 14. Open decisions for Erron

1. Final name and domain.
2. Anonymity threshold K (default 10).
3. Phase 2 Stripe connection method (Connect OAuth or Stripe App vs restricted write key).
4. Whether to keep the 60-day guarantee.
5. Founder photo and bio wording for the homepage.
6. Verify comparison-table claims about competitors against their current pages before launch.

---

## 15. Validation gates (do not skip)

| Checkpoint | Go | Kill or rethink |
|---|---|---|
| Phase 0, 7 days | 15 of 50 founders contacted connect or send data | Fewer than 5 |
| Day 30 | 75+ connected accounts, 5+ paid sprints, 20%+ save rate on live flows | Under 30 connections or zero sprints |
| Day 60 | $3K+ MRR excluding sprint fees; recovered revenue at least 3x price for every client | Recovered revenue under 1x price for most clients |
| Day 90 | $6K+ MRR, 250+ connections, logo churn under 5% monthly, 1,000+ newsletter subscribers | Under $2K MRR or connections stalled under 100 |

Fallback if killed: a lifecycle marketing service for PLG SaaS, using the sprint clients already won.
