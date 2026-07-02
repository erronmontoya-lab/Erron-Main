# Startup Opportunity Scout — July 2026

Solo-founder, AI-enhanced, growth-loop-native opportunities. 17 live web searches across pain mining, review-gap mining, indie revenue reports, platform shifts, regulatory changes, and search-demand signals. Scored on 9 vectors; **growth loop** and **saturation** weighted 2x (max score 110).

**Exclusion check:** none of the six ideas below touch SMB professional networking or relationship platforms. Closest adjacency is Idea 2 (sells tooling *to* SMB merchants — product-data software, zero networking/relationship component). Clean, but flagged for your awareness.

**The macro picture that shaped this list:** three tectonic shifts all landed inside the last 6 months — (1) MCP Apps launched inside ChatGPT and Claude (Jan 26, 2026) with discovery still primitive; (2) Shopify auto-syndicated every US merchant into ChatGPT shopping (Mar 11, 2026) with AI-driven orders up ~13x YoY, stranding non-Shopify merchants; (3) Chrome Lighthouse made "Agentic Browsing" a default audit category (May 7, 2026). Meanwhile EAA enforcement litigation began (Nov 2025) creating mandatory compliance spend. Every idea below rides one of these four waves.

---

## Idea 1 — PromptShare: intent-share rank tracker for the ChatGPT App Directory

**One-liner:** Sensor Tower for the AI app stores — tracks which user prompts invoke which apps inside ChatGPT (and Claude), sold to app builders and the brand agencies advising them.

**The signal:**
- OpenAI [opened app submissions to the ChatGPT directory](https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/) with 800M–1B weekly users on the platform.
- Phiture (top ASO agency): ["Discovery in the App Directory is still basic. The name carries the most indexation weight, long-tail keyword searches don't yet work reliably."](https://phiture.com/asostack/chat-gpt-app-directory/) — this is the App Store in 2009, pre-Sensor-Tower.
- [MCP Apps announced jointly by Anthropic and OpenAI on Jan 26, 2026](https://workos.com/blog/building-mcp-apps-inside-claude-chatgpt), explicitly compared to the iPhone SDK moment; MCP SDK downloads grew 4,750% in 16 months.
- Verified: [Sensor Tower tracks the ChatGPT *mobile app*](https://sensortower.com/), not apps *inside* ChatGPT. No incumbent analytics layer exists for in-ChatGPT app invocation.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 6 | Builders manually probe prompts in spreadsheets today; agencies (Phiture, Fantasy) are already billing brands for directory playbooks — budget exists but is young. |
| Timing | 9 | Directory opened months ago, discovery is admittedly primitive, and no data layer exists — this window is measured in quarters. |
| AI exposure | 7 | AI-enabled (you use LLMs to run probe panels); commoditization clock ~2–3 yrs; the risk is platform, not AI. |
| **Growth loop (2x)** | 8 | Public leaderboards + embeddable "invoked #1 for [prompt cluster]" rank cards that builders paste into build-in-public posts; free rank checks convert lurkers. |
| **Saturation (2x)** | 9 | Zero direct competitors found across searches; nearest players track brand mentions, not app invocation share. |
| Solo feasibility | 7 | Probe infrastructure is cron jobs + API spend; support is light; ~15 hrs/wk at $10K MRR. |
| Founder fit | 8 | This is a distribution-data + content-loop business — your exact playbook, applied to a surface where nobody has run it yet. |
| Unit econ & speed | 7 | $49–$299/mo tiers; margin dented by probing API costs; first dollar in <30 days via founding tier off one viral leaderboard post. |
| Defensibility | 6 | Longitudinal invocation data compounds and can't be backfilled; but OpenAI could ship native analytics (see hard question). |

**Weighted total: 84/110**

**The growth loop, explicitly:** Customer 10 (an app builder) embeds a "Top app for [travel planning prompts]" rank card in their launch post and X threads → customer 11 (a competing or adjacent builder) sees it, hits the free rank-check tool to see where *they* stand, gets a partial answer and a paywall. Public category leaderboards are indexable, citable content that recruits the next cohort every time the rankings shift. More customers → more probe budget → better data → more citations.

**The one hard question:** Does OpenAI ship native app analytics in the developer dashboard within 12 months and vaporize the independent layer? Mitigation is the same one that saved Sensor Tower from App Store Connect: be the *neutral cross-platform aggregator* (ChatGPT + Claude + Gemini surfaces) with competitor visibility, which first-party dashboards never give.

**First 3 validation moves:**
1. *(No code)* DM 15 builders with apps live in the directory (find them via launch threads on X and the directory itself) and ask one question: "What would you pay to know your invocation share vs. competitors for your top 20 intents?" Count pre-commits.
2. Manually probe 50 high-intent prompts in one category (e.g., travel) across fresh ChatGPT sessions, publish "Who wins travel prompts in ChatGPT — July 2026" as a leaderboard post; measure waitlist conversion.
3. Pre-sell a $99/mo founding tier to 10 builders from that post's traffic before building the dashboard.

**Revenue model + 12-month ceiling:** SaaS at $49 (builder) / $299 (brand/agency) per month, plus quarterly category data reports. Solo ceiling ≈ **$15–25K MRR** — capped by the ecosystem's youth, uncapped if ChatGPT apps monetization rails ship (see watch list).

---

## Idea 2 — FeedFixer: AI-shopping visibility + product-data repair for non-Shopify merchants

**One-liner:** A WooCommerce-first plugin + dashboard that scores whether a store's products can be found and bought by AI shopping agents, then fixes the product data — for the millions of merchants Shopify just structurally lapped.

**The signal:**
- [Shopify activated Agentic Storefronts by default for all eligible US merchants on Mar 11, 2026](https://www.shopify.com/news/agentic-commerce-momentum); Q1 2026 AI-driven orders up ~13x YoY, AI-channel buyers converting ~2x.
- ["WooCommerce was not a UCP launch partner and has zero built-in support for AI-mediated purchases… six layers of infrastructure that AI agents require"](https://seresa.io/blog/agentic-commerce-readiness/shopify-got-ucp-for-free-and-woocommerce-stores-must-build-it-themselves).
- The plumbing layer is already commoditizing — [4+ free ACP/UCP plugins appeared on WordPress.org within months](https://wordpress.org/plugins/agentic-commerce-protocol-chatgpt-product-feed-ovena-acp-for-woocommerce/) — but they only expose endpoints; none diagnose *why your products don't get recommended*.
- Enterprise AI-visibility trackers exist ([Promptwatch at 6,700 brands](https://surferstack.com/guides/ai-search-visibility-tools-with-chatgpt-shopping-tracking-in-2026-complete-feature-comparison)) but nothing priced or packaged for a $500K/yr Woo store.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 8 | Merchants are watching Shopify competitors take 13x-growing AI orders by default — revenue FOMO is the strongest WTP trigger there is. |
| Timing | 9 | The Shopify/Woo gap opened in March 2026 and is being actively written about; the panic phase is now. |
| AI exposure | 7 | AI-enabled (LLM-driven product-data auditing); ~2–4 yr clock before platforms absorb it. |
| **Growth loop (2x)** | 7 | Free public store scan with shareable grade + WordPress.org plugin directory as a zero-CAC discovery surface + agencies running branded scans on prospects. |
| **Saturation (2x)** | 6 | Plumbing plugins are free and multiplying; enterprise trackers loom upstream; the SMB diagnose-and-fix slot is open but the window is narrow. |
| Solo feasibility | 8 | WP plugin + hosted dashboard; Woo support burden is real but forum-manageable with AI. |
| Founder fit | 9 | Feed optimization, merchant acquisition, freemium conversion — dead-center growth marketing. |
| Unit econ & speed | 8 | $29–$99/mo, freemium plugin CAC ≈ $0, first dollar within days of directory approval. |
| Defensibility | 5 | Which product-data patterns get cited by AI agents is compounding know-how, but the plugin ecosystem races to the bottom. |

**Weighted total: 80/110**

**The growth loop, explicitly:** Customer 10 installs the free plugin from the WP directory → their public "AI Shopping Readiness: C+" scan page and fix log are shareable; their agency sees the branded report and runs scans across its whole client book → customers 11–18. Plugin directory rankings compound with active installs, which the free tier drives.

**The one hard question:** How fast do Automattic (Woo core) and Stripe's Agentic Commerce Suite ship native readiness tooling and reduce you to a free feature? You are monetizing a platform gap the platform is incentivized to close — this is a 18–24-month cash business unless the diagnostic layer builds real data moat.

**First 3 validation moves:**
1. *(No code)* Post a manual "AI shopping readiness teardown" offer in 3 WooCommerce Facebook groups / r/woocommerce — audit 10 stores by hand against ACP/UCP product-data requirements; charge $99 to test WTP.
2. Publish the aggregated findings ("We audited 25 Woo stores: 88% are invisible to ChatGPT shopping") and measure merchant + agency inbound.
3. Ship a scan-only free tool (no fix) on a landing page; measure scan→email→paid-teardown conversion before writing plugin code.

**Revenue model + 12-month ceiling:** Freemium plugin → $29–$99/mo SaaS (monitoring + fixes), agency tier at $249/mo. Solo ceiling ≈ **$20–30K MRR** riding the panic wave, with explicit decay risk after platform absorption.

---

## Idea 3 — Statement: productized EAA compliance docs for small SaaS ("iubenda for accessibility")

**One-liner:** AI-assisted scanning + guided manual checks + hosted accessibility statement + EN 301 549 ACR/VPAT draft, at $99–299/mo — for the thousands of small SaaS companies facing EU procurement blockers and a consultant market that starts at $30K.

**The signal:**
- [EAA enforcement began June 28, 2025; first lawsuits filed in France Nov 2025, with more member states enforcing in 2026](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/). Applies to any SaaS with EU users regardless of company location.
- Pricing umbrella is enormous: [audits run $100–250/page and full engagements $30K–$60K](https://www.digitala11y.com/how-much-does-a-web-accessibility-audit-cost/) — nothing exists for a 5-person SaaS.
- ["Without proper accessibility documentation, SaaS platforms are automatically disqualified from EU government contracts, educational institutions, and enterprise deals"](https://www.accessibility.works/blog/saas-eaa-compliance-european-accessibility-act-en-301-549-requirements/) — procurement is the enforcement mechanism, not just courts.
- The cheap alternative is discredited: [overlays were cited in 25% of all 2024 accessibility lawsuits and the EU Commission rejects them for EN 301 549](https://www.accessibility.works/blog/avoid-accessibility-overlay-tools-toolbar-plugins/) — a giant, litigation-validated wedge against accessiBe/UserWay.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 8 | Mandatory spend with active lawsuits and lost deals; current workarounds are $30K consultants or ignoring it and losing EU contracts. |
| Timing | 8 | Enforcement litigation started 8 months ago and ramps through 2026 — the "GDPR 2018" panic curve, early-middle. |
| AI exposure | 7 | AI-enabled: LLMs now make guided manual checks and ACR drafting solo-feasible; trust requirement slows commoditization (~3–5 yrs). |
| **Growth loop (2x)** | 7 | Hosted public accessibility statement on every customer's domain with a "Maintained with Statement" badge/backlink — the exact embedded loop that built iubenda and Vanta's trust pages. |
| **Saturation (2x)** | 7 | Enterprise players (Level Access, Deque) ignore sub-$5K deals; overlays are radioactive; only scattered VPAT generators (e.g. AllAccessible) sit in the slot. |
| Solo feasibility | 6 | Must ruthlessly scope to documentation + monitoring + guided remediation — the moment you promise certified audits, you need humans and it breaks. |
| Founder fit | 6 | Not a growth-marketing edge per se, though the PLG/badge motion plays to it; domain must be learned. |
| Unit econ & speed | 8 | $99–299/mo, ~90% margin, urgent regulated budget; first dollar in <45 days via productized "EAA readiness pack." |
| Defensibility | 7 | Regulatory-content SEO asset, trust brand, and switching costs on hosted statements all compound. |

**Weighted total: 78/110**

**The growth loop, explicitly:** Customer 10's accessibility statement lives at `customer.com/accessibility` with a badge and backlink → customer 11 is a peer SaaS founder who lands on that page during *their* EU procurement scramble, clicks through, and self-serves. Procurement teams that see the standardized ACR format start asking other vendors for the same artifact.

**The one hard question:** Automated + AI-guided testing covers maybe 40–50% of WCAG — are you selling real risk reduction or false confidence, and can positioning ("documentation + evidence + remediation guidance, not certification") survive both customer expectations and a regulator's gaze?

**First 3 validation moves:**
1. *(No code)* Offer a manual "EAA readiness pack" (statement + gap summary + ACR draft) for $499 to 10 indie SaaS founders via Indie Hackers / r/SaaS; deliver with existing scanners + LLM drafting. WTP proven or killed in 2 weeks.
2. Publish "The EAA compliance guide for SaaS under 20 employees" targeting the panic query cluster; measure organic + email capture.
3. Interview 5 EU procurement officers or bid consultants: confirm ACR docs are actually gating deals at SMB scale, not just enterprise.

**Revenue model + 12-month ceiling:** $99–299/mo subscription + $499 one-time readiness packs as the wedge. Solo ceiling ≈ **$15–20K MRR**.

---

## Idea 4 — MCP Meter: usage metering + billing for indie MCP server developers

**One-liner:** Gumroad-simple metering, paywalls, and billing for the developers monetizing MCP servers — the picks-and-shovels of the "MCP servers are the new SaaS" wave.

**The signal:**
- [MCP SDKs hit 97M monthly downloads, up 4,750% in 16 months](https://toloka.ai/blog/the-future-of-mcp-enterprise-adoption/); 10,000+ public servers live.
- Dev-community monetization wave visible: ["MCP Servers Are the New SaaS: How I'm Monetizing AI Tool Integrations in 2026"](https://dev.to/krisying/mcp-servers-are-the-new-saas-how-im-monetizing-ai-tool-integrations-in-2026-2e9e).
- Existing observability is all enterprise gateways ([WSO2, ContextForge — rate limiting, OTel, governance](https://bytebridge.medium.com/mcp-gateways-in-2026-top-10-tools-for-ai-agents-and-workflows-d98f54c3577a)); nothing found that gives an indie dev a paywall + Stripe checkout + per-tool-call metering in 10 minutes.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 7 | Devs are duct-taping Stripe + API keys today; metering agent tool-calls is genuinely annoying to build. |
| Timing | 8 | The monetization wave is starting now; the infra wave (gateways) went enterprise and skipped indies. |
| AI exposure | 7 | AI-enabled; ~2–3 yr clock; the threat is Stripe, not models. |
| **Growth loop (2x)** | 8 | Embedded: every paywalled server surfaces "metered by MCP Meter" at the point of payment — and the payer is another developer, i.e., a perfect prospect. |
| **Saturation (2x)** | 7 | Enterprise gateways exist; the indie billing slot looks open, but Stripe's usage-based billing is one SDK release away. |
| Solo feasibility | 7 | Billing infra means real support stakes; scope to metering + Stripe Connect, never touch money directly. |
| Founder fit | 6 | Dev tool with PLG mechanics you understand, but not your domain depth. |
| Unit econ & speed | 6 | Rev-share (2–5% of metered revenue) is beautiful at scale and slow at the start; first dollar depends on customers earning first. |
| Defensibility | 6 | Modest: integration lock-in and a cross-server payer graph, if you get there. |

**Weighted total: 77/110**

**The growth loop, explicitly:** Customer 10 paywalls their MCP server; every developer who *pays* to use that server passes through an MCP Meter checkout → a meaningful fraction of those payers run their own servers → customer 11. The buyer pool and seller pool are the same people — the Stripe/PayPal early loop.

**The one hard question:** Stripe co-authored the Agentic Commerce Protocol and already owns agentic checkout — when they ship MCP-native usage billing, are you a company or a feature? You'd need the indie community position locked before that happens.

**First 3 validation moves:**
1. *(No code)* Interview 15 devs from MCP directories (Smithery, mcp.directory) who ship popular servers: how do they monetize today, what breaks, would they take a 3% metered-billing rail?
2. Write "How to paywall an MCP server in 2026" — the definitive guide; measure dev signups against the pain.
3. Hand-integrate billing for 3 server authors as design partners (manual Stripe setup + a thin metering proxy) before productizing.

**Revenue model + 12-month ceiling:** 2–5% of metered revenue + $19/mo base. Solo ceiling ≈ **$8–15K MRR** in 12 months (rev-share lag), with venture-scale upside if the ecosystem's monetization wave is real.

---

## Idea 5 — The AI Answer Index: vertical share-of-voice benchmark data asset

**One-liner:** The "Nielsen ratings of AI answers" — quarterly benchmark reports on which brands ChatGPT/Gemini/Perplexity actually recommend per vertical, monetized via sponsorship, report sales, and data licensing.

**The signal:**
- [AI-generated recommendations now influence 60%+ of purchase decisions](https://alhena.ai/blog/best-ai-visibility-tools-ecommerce/) and [zero-click rates hit ~93% inside AI Mode](https://memeburn.com/google-ai-overview-statistics/) — CMOs know AI answers matter and have no trusted third-party scoreboard.
- The [15+ GEO platforms](https://www.evertune.ai/resources/insights-on-ai/top-15-generative-engine-optimization-geo-platforms-for-2026) publish scattered data as content marketing, but none owns the neutral, citable, per-vertical benchmark position — they're all conflicted (they sell the optimization).

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 6 | CMOs need board-level proof of AI visibility; today they screenshot ChatGPT — but data-asset WTP is softer than tool WTP. |
| Timing | 8 | The measurement vacuum is now; whoever's index gets cited first becomes the default. |
| AI exposure | 7 | AI-enabled (probe panels are LLM automation); the *asset* is longitudinal data + brand, which AI can't backfill. |
| **Growth loop (2x)** | 8 | Rankings-PR loop: every brand featured shares its placement, every journalist covering "AI is reshaping buying" cites the index, each cycle recruits next quarter's sponsors. |
| **Saturation (2x)** | 5 | GEO platforms can out-publish you the moment a vertical shows traction; your only defense is per-vertical focus + neutrality. |
| Solo feasibility | 8 | Probe panel + report production is exactly what AI leverage is for; no support burden. |
| Founder fit | 9 | Data-PR, content loops, category creation — the purest expression of your skill set on this list. |
| Unit econ & speed | 6 | Sponsorships and report sales are lumpy; first dollar plausible in 60 days but MRR-ification takes a data-subscription layer. |
| Defensibility | 7 | Longitudinal quarterly panels can't be recreated retroactively; brand neutrality compounds. |

**Weighted total: 77/110**

**The growth loop, explicitly:** Customer 10 is a fintech brand that sponsored the Q3 index; they publish "ranked #2 in AI answers for small-business banking" with a link → competitors and adjacent brands see it, request their own placement data → customer 11 buys the report or sponsors Q4. Journalists complete the loop by citing the index as the neutral source.

**The one hard question:** Is this a business or a very good marketing asset for a business? Standalone data-media plays plateau without a subscription product underneath — you may end up building Idea 1 anyway, with this as its top-of-funnel.

**First 3 validation moves:**
1. *(No code)* Manually probe 100 buying-intent prompts in ONE vertical (e.g., B2B payroll), build the ranking in a spreadsheet, publish as "The AI Answer Index: Payroll, Q3 2026."
2. Pitch the ranking to 5 industry newsletters/journalists; count citations and brand inbound.
3. Offer featured brands a $500 "full placement dataset" — WTP test on the exact buyer.

**Revenue model + 12-month ceiling:** Report sales ($500–2K), quarterly sponsorships ($2–10K), data subscriptions. Solo ceiling ≈ **$10–15K MRR-equivalent**, lumpy.

---

## Idea 6 — AgentGrade: agent-readiness grader + fix layer for the general web

**One-liner:** Free shareable "can AI agents use your website?" grade + paid fixes and monitoring, riding Chrome Lighthouse's new default Agentic Browsing audit.

**The signal:**
- [Chrome Lighthouse 13.3.0 promoted "Agentic Browsing" to a default audit category on May 7, 2026](https://www.lucidmedia.co.nz/blog/lighthouse-agentic-browsing-llms-txt-webmcp/) — every dev running Lighthouse/PageSpeed now sees agent-readiness failures.
- [Cloudflare shipped an Agent Readiness score](https://blog.cloudflare.com/agent-readiness/); free scanners ([AgentReady](https://www.agentready.website/), [IndexedAI](https://www.scriptbyai.com/indexedai-agent-readiness-score/)) exist but are thin and unmonetized.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 5 | Devs see the failures, but [Google itself says llms.txt does nothing for rankings](https://www.digitalapplied.com/blog/google-llms-txt-no-seo-value-lighthouse-audit-2026) — the "so what" is unproven, so budgets are curiosity-sized. |
| Timing | 8 | Lighthouse default status is 8 weeks old — maximal attention. |
| AI exposure | 6 | The standards (llms.txt, WebMCP) are unsettled; this layer could be rewritten twice in 18 months. |
| **Growth loop (2x)** | 8 | Free grader + shareable score + badge — the HubSpot Website Grader playbook, verbatim. |
| **Saturation (2x)** | 5 | Multiple free scanners already anchor price at $0; Cloudflare gives it away. |
| Solo feasibility | 8 | Scanner + reports is light infrastructure. |
| Founder fit | 9 | You could run this grader loop in your sleep. |
| Unit econ & speed | 5 | Unclear who pays and for what outcome — fixes without a proven revenue link sell poorly. |
| Defensibility | 4 | No data moat, no switching cost, standards churn. |

**Weighted total: 71/110**

**The growth loop, explicitly:** Customer 10 shares their "AgentGrade: 87 — top 5% of ecommerce" badge → a competitor scans their own site off the shared link → customer 11. Classic grader loop; the problem isn't the loop, it's what's sold behind it.

**The one hard question:** Is agent-readiness a business or a lead magnet? Until AI agents transacting through general websites is demonstrably revenue-linked (as it already is in commerce — see Idea 2), you're selling vitamins to developers with free alternatives.

**First 3 validation moves:**
1. *(No code)* Run existing free scanners against 30 sites in one revenue-sensitive niche (booking/reservations), hand-write 3 teardowns, and try to sell one $299 fix engagement.
2. Track whether *anyone* in that niche can attribute revenue to agent traffic yet (server logs, OpenAI referrers).
3. If no revenue link is found within 2 weeks, park it on the watch list — do not build.

**Revenue model + 12-month ceiling:** $199–499 one-time fix packs + $29/mo monitoring. Solo ceiling ≈ **$5–10K MRR** today — capped until agent traffic monetizes.

---

# Final section

## Ranked recommendation: build Idea 1 (PromptShare) first

It has the rarest asset on this list — a genuinely empty category on a surface (the ChatGPT App Directory) that a billion-user platform just opened, where the platform owner admits discovery is primitive and no Sensor-Tower-equivalent exists. Your growth-marketing DNA is the unfair advantage: the product *is* a leaderboard-and-data content loop, first revenue is achievable inside 30 days with a founding tier sold off one viral category ranking, and the longitudinal invocation dataset compounds into a moat no later entrant can backfill. Run Idea 5 (the AI Answer Index) as its top-of-funnel rather than a separate company — same probing infrastructure, and the index's PR loop feeds the tracker's waitlist.

## Watch list

1. **AgentGrade (Idea 6)** — trigger: first credible reports of AI-agent-completed transactions on non-commerce sites (bookings, signups) showing up in analytics referrer data, or WebMCP hitting a W3C milestone with Chrome shipping agent APIs broadly. When agent traffic = revenue, this converts from lead magnet to business in weeks. Check in 60 days.
2. **ChatGPT app monetization rails** — trigger: OpenAI shipping revenue share / in-app payments broadly to directory apps. This 5–10x's Idea 1's TAM overnight (every app becomes a business that *must* buy ranking data). Counter-signal to watch simultaneously: OpenAI shipping native app analytics — that's the signal to double down on cross-platform (Claude/Gemini) coverage.

## Discard pile

| Idea found | Kill reason |
|---|---|
| Generic GEO/AEO brand-mention tracker | Crowded **and** competent: [15–17 funded tools](https://www.evertune.ai/resources/insights-on-ai/top-15-generative-engine-optimization-geo-platforms-for-2026), Promptwatch already at 6,700 brands. |
| Agency client-reporting automation | Biggest validated pain in [148K complaints](https://bigideasdb.com/business-pain-points-2026), but AgencyAnalytics/Whatagraph/Swydo own it — no wedge left. |
| AI cold-email personalization | [Dozens of tools, "AI slop" buyer backlash](https://www.hypergen.io/blog/best-cold-email-software), deliverability arms race, zero embedded loop. |
| Accessibility overlay widget | [Cited in 25% of 2024 lawsuits, rejected by EU Commission](https://www.accessibility.works/blog/avoid-accessibility-overlay-tools-toolbar-plugins/) — lawsuit magnet, ethically dead. |
| Dunning / payment recovery micro-SaaS | High margin per indie reports, but Churnkey/Baremetrics own it and there's no loop — pure feature. |
| WooCommerce ACP/UCP protocol plugin (plumbing only) | [4+ free plugins shipped within months](https://wordpress.org/plugins/ucphub-for-woocommerce/) — racing to $0; the value moved up-stack (Idea 2). |
| ChatGPT Apps SDK boilerplates/courses | Fast first dollar, zero moat, no loop, dies with the first official template. |
| B2C habit/utility apps (HabitKit model) | [Real revenue ($28K MRR)](https://www.indiehackers.com/post/tech/hitting-16k-mrr-after-years-of-failed-products-h5lM0xJmVrRZM0B23MT6) but a 2.5-year ASO grind with zero founder fit. |
| "AI agents for passive income" genre | Hype without behavior change; GPT-wrapper graveyard. |
| Enterprise MCP security/governance gateways | Real problem (40% of public servers unauthenticated) but requires enterprise sales — violates solo constraint. |

## Method note

17 live searches run across: Reddit/forum pain mining, G2/Capterra review-gap mining, indie hacker revenue reports, platform/API shifts (MCP Apps, Apps SDK, ACP/UCP, Lighthouse), regulatory changes (EAA, EU AI Act), and search-demand signals. Key sources cited inline per idea.
