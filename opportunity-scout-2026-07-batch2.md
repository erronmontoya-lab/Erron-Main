# Startup Opportunity Scout — July 2026, Batch 2

Second sweep, deliberately avoiding Batch 1's waves (MCP apps, agentic commerce, EAA accessibility, agent-readiness). 12 fresh live searches across: EU AI Act deadlines, community-platform review gaps, AI-slop/proof-of-human backlash, voice-agent ops, hiring's AI doom loop, marketplace policy shifts, newsletter economy, C2PA provenance, and indie revenue reports.

Scoring unchanged: 9 vectors, growth loop + saturation weighted 2x, max 110.

**Exclusion check:** nothing here touches SMB professional networking or relationship platforms. Closest adjacency: Idea 4 sells policy-monitoring software to marketplace sellers — no networking component. Clean.

**The macro finds this batch:** (1) EU AI Act **Article 50 transparency obligations hit August 2, 2026 — ~30 days out** — chatbot disclosure + AI-content labeling becomes mandatory, and the May 2026 Omnibus deal delayed the *high-risk* rules to 2027–28, meaning enterprise GRC vendors are pointed at the wrong deadline while the SMB transparency slot sits nearly empty. (2) Paid-newsletter churn runs ~50%/year and beehiiv's own native retention flows are used by "only a small handful" of publishers. (3) Etsy removed 12,000+ listings in Q1 2026 under its new AI-disclosure policy while 60%+ of major platforms updated AI policies. (4) Hiring is in an "AI doom loop" — massive pain, but the tooling side is a funded arms race.

---

## Idea 1 — DiscloseKit: the cookie banner for AI (EU AI Act Article 50 compliance kit)

**One-liner:** Drop-in AI disclosure widget + hosted AI transparency statement + content-labeling helper for any SMB running a chatbot or publishing AI-generated content to EU users — mandatory August 2, 2026.

**The signal:**
- [Article 50 obligations apply from 2 August 2026](https://artificialintelligenceact.eu/article/50/): chatbots must disclose they're AI; AI-generated text/image/audio must be marked machine-readably; deployers publishing AI text "informing the public" must disclose.
- The [EU AI Office is still drafting the Code of Practice on AI-content transparency](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content) — the rules land before the how-to guide does, which is exactly the confusion window compliance micro-SaaS monetizes.
- Competitive whitespace verified: only one young content-first player found ([ActReady](https://getactready.com/blog/eu-ai-act-article-50-transparency-checklist)); a follow-up search for "AI Act policy generator / AI transparency statement generator SaaS" returned **no direct product results**. Meanwhile [enterprise AI Act tooling is "re-skinned GRC tools"](https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks) aimed at the high-risk tier — whose deadlines the [May 7, 2026 Omnibus deal just pushed to Dec 2027 / Aug 2028](https://www.stibbe.com/publications-and-insights/ai-act-reloaded-what-the-latest-ai-act-changes-mean-in-practice), pointing incumbents away from the Aug 2026 transparency deadline.
- Precedent: cookie-consent (iubenda, CookieYes, Cookiebot) built 8-figure businesses on a structurally identical obligation — ambient legal fear + a widget + a badge.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 7 | Mandatory with real fines; current workaround is asking a lawyer ($$$) or ignoring it — the cookie-banner precedent says SMBs pay small monthly sums to make legal fear go away. |
| Timing | 9 | Thirty days to the deadline, code of practice unfinished, incumbents pointed at the delayed high-risk tier. |
| AI exposure | 7 | AI-enabled; the durable value is regulatory tracking + hosted infrastructure + badge network, not the template itself. |
| **Growth loop (2x)** | 8 | Every widget and hosted transparency statement carries a "AI disclosure by DiscloseKit" backlink — the exact embedded loop that built iubenda and CookieYes. |
| **Saturation (2x)** | 8 | One young content player; zero product incumbents found in direct search; GRC platforms structurally mispointed. |
| Solo feasibility | 8 | Widget + statement generator + regulatory changelog; support is templated; one lawyer review of templates, then leverage. |
| Founder fit | 7 | Freemium/PLG distribution and badge-loop mechanics are your core game; the legal-content muscle must be built (or bought once). |
| Unit econ & speed | 8 | $19–99/mo, 90%+ gross margin, deadline-driven urgency = first dollar in weeks; CAC path is SEO on panic queries + the badge loop. |
| Defensibility | 6 | Clonable product — the moat is the regulatory-content SEO asset, embed switching costs, and winning distribution before fast followers arrive. |

**Weighted total: 84/110**

**The growth loop, explicitly:** Customer 10 (a SaaS with an EU-facing chatbot) embeds the disclosure widget; their transparency statement lives at `customer.com/ai-transparency` with a badge → customer 11 is a founder/marketer who lands on that page mid-panic ("what does Article 50 require?"), clicks the badge, self-serves the free tier. Every compliant customer is a permanent, indexed advertisement placed exactly where the next buyer looks.

**The one hard question:** Does anyone actually enforce Article 50 against SMBs — or does this stay ambient fear that converts at cookie-banner rates anyway? (Cookie banners suggest the fear converts regardless; but if the Code of Practice lands with radically specific technical marking requirements, the product must pivot fast to match it.)

**First 3 validation moves:**
1. *(No code)* Publish "The Article 50 checklist for companies with a chatbot" + a free AI-transparency-statement Google Doc template; promote in EU founder communities; measure email capture against the Aug 2 panic.
2. Buy-intent probe: offer a $99 "Article 50 readiness pack" (statement + disclosure copy + implementation checklist) to 20 EU-exposed SaaS founders — count conversions in 14 days.
3. Ship the widget as a 30-line embed with a hosted statement behind it; convert pack buyers to $29/mo hosting + monitoring before building anything else.

**Revenue model + 12-month ceiling:** Freemium → $19–99/mo (hosted statement, widget, regulatory updates, multi-language). Solo ceiling ≈ **$15–25K MRR**, with the upside case being "the iubenda of AI compliance" if the badge loop compounds before copycats arrive.

---

## Idea 2 — CreatorRetain: churn infrastructure + benchmarks for paid newsletters and communities

**One-liner:** Retention engine (cancel flows, pause offers, win-back lifecycle, dunning) plus the industry's churn benchmark dataset, for paid newsletter and community operators bleeding ~50%/year — sold on performance.

**The signal:**
- [The typical paid Substack churns ~50%/year; a writer charging $8/mo needs 31 new paid subs monthly just to break even](https://www.reallygoodbusinessideas.com/p/substack-publication-stats).
- The enablement gap is explicit: beehiiv ships native retention flows, but ["only a small handful of paid publishers on beehiiv currently use retention offers, but the ones who do see a meaningful lift"](https://www.beehiiv.com/support/article/34177235644823-pausing-and-subscriber-retention-options) — a well-designed flow recovers 10–20% of cancellations; dunning recovers 20–40% of failed payments.
- Structural churn *between* platforms too: [high-revenue creators defecting from Substack over the 10% fee](https://sacra.com/c/substack/) — operators are revenue-anxious and actively re-tooling.
- Incumbents ([Churnkey](https://churnbuster.io/articles/best-churn-management-software), Churn Buster) are built for SaaS/D2C billing stacks, not the Substack/beehiiv/Ghost/Skool creator stack.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 7 | Churn is a monthly, visible revenue wound; operators currently do nothing (the workaround is literally "publish more"). |
| Timing | 7 | Paid-creator economy is maturing past acquisition-only thinking; platform fee wars have operators scrutinizing net revenue right now. |
| AI exposure | 7 | AI-enabled: AI writes the win-back sequences and reads cancel-survey text at scale; relationship know-how slows commoditization. |
| **Growth loop (2x)** | 7 | Dual loop: (a) quarterly "State of Paid Newsletter Churn" benchmark report — operators share their percentile like a badge of honor; (b) creator-economy density — your customers' peers literally subscribe to each other, so every save-flow and win-back email is seen by other operators. |
| **Saturation (2x)** | 6 | Generic churn tools ignore the creator stack; platforms ship basic native flows (absorption risk); nobody owns the category or the data. |
| Solo feasibility | 8 | Launch as productized setup + templates (AI-leveraged), harden into software on Stripe/beehiiv/Ghost APIs; support is seasonal, not 24/7. |
| Founder fit | 10 | Lifecycle marketing, retention mechanics, offboarding flows, benchmark-driven content — this is your literal job description weaponized. |
| Unit econ & speed | 7 | Performance pricing ("pay from recovered revenue") makes yes easy; first dollar in <30 days via 5 done-for-you setups; MRR-ification takes a quarter. |
| Defensibility | 6 | The cross-platform churn benchmark dataset compounds and can't be backfilled; playbooks alone are clonable. |

**Weighted total: 80/110**

**The growth loop, explicitly:** Customer 10 (a 2,000-paid-sub newsletter) runs your cancel flow and win-back sequence; they contribute anonymized churn data and get their benchmark percentile → they share "we cut churn 18% — here's our percentile" to their operator-heavy audience (creators' audiences are full of other creators) → customer 11 requests their own benchmark, which requires connecting their billing data, which is the product's front door.

**The one hard question:** Platform absorption — beehiiv/Ghost/Substack all have roadmap incentive to ship better native retention. Your counter is the cross-platform benchmark dataset and optimization layer they can't each build alone — but if you haven't become "the churn authority" within ~12 months, the window shuts.

**First 3 validation moves:**
1. *(No code)* Free churn teardowns for 10 paid newsletters (≥500 paid subs) sourced from operator communities — audit their cancel flow, dunning, and win-back; publish anonymized findings.
2. Sell 5 done-for-you retention setups at $750 using native beehiiv/Ghost features + AI-written sequences — WTP proven or killed inside 2 weeks.
3. Launch the "Paid Newsletter Churn Benchmark" survey; 50 respondents = the data asset's v1 and the first PR loop cycle.

**Revenue model + 12-month ceiling:** $750 setup → $99–299/mo optimization + benchmarks, or 10% of recovered revenue. Solo ceiling ≈ **$12–20K MRR** — capped by niche size, extended by expanding to Skool/Circle paid communities (same playbook, same buyer psychology).

---

## Idea 3 — Article4: AI literacy compliance-in-a-box (the other AI Act deadline nobody's selling to)

**One-liner:** Off-the-shelf AI literacy training + attestation tracking + shareable certificates for EU SMBs — Article 4 has required "AI literacy for all staff" since February 2025 and almost nobody is compliant.

**The signal:**
- [Article 4 AI literacy obligations have been in force since February 2025 and bind every organization whose staff uses AI](https://www.delbion.com/en/insights/eu-ai-act-sme-compliance-guide/) — that's functionally every EU company using ChatGPT — with broader enforcement context arriving [August 2026](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).
- The readiness gap is quantified: [95% of Dutch organizations have adopted AI tools; ~5% see governed, measurable value — "the biggest gap is not lack of tools, but lack of visibility and governance"](https://dominikgabor.com/blog/eu-ai-act-compliance-netherlands-sme.html).
- The existing market answer is enterprise GRC suites or law-firm workshops — nothing at the $50/mo "KnowBe4-for-AI-literacy" altitude for a 15-person company.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 6 | Real obligation, but felt urgency is softer than Article 50's hard deadline — this sells on audit anxiety and procurement questionnaires. |
| Timing | 8 | Aug 2026 raises the overall AI Act temperature; every compliance article now mentions Article 4, and B2B customers are starting to ask vendors for evidence. |
| AI exposure | 7 | AI-enabled (AI builds and updates the curriculum); the compliance wrapper — attestation logs, versioned records — is the sold artifact. |
| **Growth loop (2x)** | 7 | Employee completion certificates shared to LinkedIn (the HubSpot Academy badge mechanic) + a company-level "AI-literate workforce" badge; every certificate is an impression on peers at other companies. |
| **Saturation (2x)** | 6 | Compliance-training incumbents (KnowBe4 et al.) will bolt this on eventually; today the AI-Act-specific SMB slot is close to empty. |
| Solo feasibility | 8 | Content + LMS-lite + certificate infra — all AI-buildable; support minimal. |
| Founder fit | 7 | Certification/badge loops and B2B content distribution are growth-marketing mechanics; training content is commodity work AI does. |
| Unit econ & speed | 8 | €49–199/mo per company by seat band; ~95% margin; first dollar in <30 days selling the training pack directly. |
| Defensibility | 5 | Content is clonable; moat is only certificate-network distribution + regulatory update cadence. |

**Weighted total: 75/110**

**The growth loop, explicitly:** Customer 10's 12 employees complete training and post certificates to LinkedIn → an ops manager at a peer company sees three of them in a week, needs the same evidence for their own Article 4 exposure → customer 11. The certificate is the ad; LinkedIn is the medium; compliance anxiety is the conversion event.

**The one hard question:** Is Article 4 ever enforced against a 15-person company — or does this only sell where procurement questionnaires demand evidence? (If the latter, the real ICP is SMB *vendors to enterprises*, which shrinks TAM but sharpens targeting.)

**First 3 validation moves:**
1. *(No code)* Post "free Article 4 compliance checklist + training outline" in EU founder/ops communities; measure downloads and reply-depth.
2. Run 3 paid pilot workshops (€500, delivered via Zoom + AI-built deck) — validates both WTP and curriculum before productizing.
3. Test the certificate loop mechanically: issue LinkedIn-shareable certificates to pilot attendees, measure actual share rate — if <20% share, the loop is fiction; re-score and reconsider.

**Revenue model + 12-month ceiling:** €49–199/mo per company + one-time team packs. Solo ceiling ≈ **$10–15K MRR**. Natural bundle partner for Idea 1 (same buyer, same fear, same badge mechanics — plausibly one company, two SKUs).

---

## Idea 4 — PolicyRadar: cross-marketplace policy compliance for multichannel sellers

**One-liner:** Monitors Etsy/Amazon/eBay policy changes (AI disclosure rules first) and scans a seller's listings for violations before the platform's enforcement bots find them — insurance against the account suspension that kills a livelihood.

**The signal:**
- [Etsy removed 12,000+ listings in Q1 2026 alone under its new AI-disclosure policy](https://www.rewarx.com/blogs/etsy-ai-generated-content-policy-update); undisclosed listings are [filtered from search entirely](https://www.inkfluenceai.com/blog/etsy-ai-disclosure-explained-2026).
- [Over 60% of major ecommerce platforms updated AI policies during 2026](https://ecombalance.com/ai-content-policies-2026/) — each with *different* rules (Etsy: everything disclosed; Amazon: only health/safety claims; eBay: minimal) — cross-platform inconsistency is the product.
- Existing tooling is single-platform and young: [iscompliant.app scans Etsy listings (trademark-first, free tier)](https://iscompliant.app/); no cross-marketplace policy-change monitor found.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 7 | Suspension = income zero; sellers already pay for far less existential tools; the workaround is anxiously reading forum threads. |
| Timing | 8 | The AI-policy divergence across platforms is a 2026 phenomenon and enforcement is demonstrably active. |
| AI exposure | 7 | AI-enabled: LLMs diff policy pages and audit listing text/images at scale — this product wasn't feasible solo two years ago. |
| **Growth loop (2x)** | 6 | Free policy-change alert newsletter shared virally in seller Facebook groups/subreddits when scary changes drop; alert screenshots travel; no embedded product loop though. |
| **Saturation (2x)** | 6 | One young free Etsy incumbent + content sites; cross-platform slot open, but low switching costs cut both ways. |
| Solo feasibility | 8 | Scraping + LLM diffing + scan reports; support from sellers is chatty but forum-manageable. |
| Founder fit | 7 | Audience-building in seller communities + fear-based email loops = your mechanics; the marketplace domain is learnable. |
| Unit econ & speed | 6 | $15–39/mo — SMB-consumer WTP is real but thin; needs volume; first dollar fast via the alert newsletter's paid tier. |
| Defensibility | 5 | Policy corpus + violation-pattern dataset compounds mildly; clonable by any funded seller-tool suite (Vela, Alura, eRank could bolt it on). |

**Weighted total: 74/110**

**The growth loop, explicitly:** Customer 10 gets a "Etsy just changed its AI photo rules — 3 of your listings are now non-compliant" alert and screenshots it into a 40K-member Etsy seller Facebook group (this is how seller news travels) → 200 sellers hit the free scanner that day → customer 11 converts when the scan finds violations. Fear is the referral mechanic; the free scan is the loop's engine.

**The one hard question:** Can a $19/mo tool survive eRank/Alura/Vela adding "policy alerts" as a checkbox feature to their existing million-seller distribution? You'd need to own the "policy authority" brand within two quarters.

**First 3 validation moves:**
1. *(No code)* Launch "Marketplace Policy Watch" — a free weekly email manually curating Etsy/Amazon/eBay policy changes; seed it in 5 seller communities; 500 subscribers in 30 days = proceed.
2. Hand-audit 20 volunteer shops against Etsy's AI-disclosure rules; publish violation-rate stats (that's the PR hook: "70% of AI-art shops we scanned are one flag from suspension").
3. Pre-sell a $99/yr founding tier to the newsletter list before building the scanner.

**Revenue model + 12-month ceiling:** Freemium scanner → $15–39/mo, agency/multi-shop tier $99/mo. Solo ceiling ≈ **$8–15K MRR** — volume business, thin WTP, real but modest.

---

## Idea 5 — VerifiedVoice: human-verified testimonials & reviews in the AI-slop era

**One-liner:** Social-proof widgets where every testimonial carries verification (identity-checked source, provenance metadata) — because AI slop is destroying default trust in reviews, and "verified human" is becoming the conversion differentiator.

**The signal:**
- The trust collapse is measured: [detected deepfake cases grew 500K → 8M (2023–25); synthetic content may hit 90% of the web in 2026](https://thetraceabilityhub.com/digital-provenance-why-content-authentication-matters-in-2026/); [74% of hiring managers report record fraud fear](https://www.hr-brew.com/stories/world-of-hr-employers-in-the-middle-east-are-drowning-in-ai-generated-job-applications-and-resumes) — the same distrust applies to marketing claims.
- The category's economics are proven — Testimonial.to reached [~$100K MRR](https://www.gladlabs.io/posts/beyond-the-bootstrap-how-indie-hackers-actually-ma-f0a313a9) on *collection alone* — but no collection player leads with verification.
- Infrastructure tailwind: [C2PA Content Credentials adoption at 6,000+ members](https://www.eyesift.com/faq/c2pa-content-credentials-2026-cryptographic-provenance-adoption/) makes provenance-stamping buildable rather than exotic.

**Scorecard (…/110):**
| Vector | Score | Why |
|---|---|---|
| Pain & WTP | 6 | Marketers already pay $29–99/mo for testimonial tools; the *verification* premium is plausible but unproven — this is a repositioning bet. |
| Timing | 7 | Slop backlash is cresting now; buyers discount unverified praise more every quarter. |
| AI exposure | 7 | AI-proof-ish by design — the product's whole point is attesting humanity; commoditization slower than pure tooling. |
| **Growth loop (2x)** | 8 | Embedded widget loop, proven by Senja/Testimonial.to free tiers: every "Verified human ✓" badge on a customer's landing page links back — and the badge begs the question competitors must answer. |
| **Saturation (2x)** | 5 | Collection tooling is crowded (Senja, Testimonial.to, Famewall…); the open slot is only the verification wedge, and incumbents could add checkmarks quickly. |
| Solo feasibility | 8 | Widget + lightweight verification flows (LinkedIn/OAuth/video liveness via API); support light. |
| Founder fit | 8 | Social proof optimization is core CRO/growth-marketing turf; you know exactly where this widget goes and why. |
| Unit econ & speed | 7 | $29–79/mo, high margin; first dollar in ~30 days riding "verified social proof" positioning against incumbents' parity features. |
| Defensibility | 5 | Verification UX and trust brand compound slowly; the checkmark itself is copyable — distribution speed decides it. |

**Weighted total: 74/110**

**The growth loop, explicitly:** Customer 10 embeds the verified-testimonial wall; 30K monthly visitors see "Verified human ✓ — via VerifiedVoice" under each quote → a competitor's marketer, whose own testimonials now look naked by comparison, clicks through → customer 11. Same physics as "Powered by Stripe" — the badge creates the deficiency it solves.

**The one hard question:** Do buyers *convert* differently on verified vs. unverified testimonials — measurably enough that marketers pay a premium? If A/B data says no, this is a feature Senja adds in a weekend, not a company. (Validation move 1 answers exactly this.)

**First 3 validation moves:**
1. *(No code)* Run the conversion experiment first: partner with 3 SaaS sites to A/B test testimonial blocks with/without a verification treatment (mock badge + "identity confirmed" microcopy); measure lift. No lift → kill.
2. Interview 15 CRO/growth leads: would they pay 2x current testimonial-tool pricing for verified proof? What verification threshold is credible to them?
3. Ship a concierge version: manually verify 10 customers' existing testimonials (LinkedIn cross-check + confirmation email) and issue badges; charge $199.

**Revenue model + 12-month ceiling:** $29–79/mo widget SaaS. Solo ceiling ≈ **$10–18K MRR** if the conversion-lift data is real; $0 if it isn't — this idea lives or dies on validation move 1.

---

# Final section

## Ranked recommendation: build DiscloseKit (Idea 1) first

It's the only idea on either list with a statutory deadline 30 days out, a verified near-empty competitive field, and a growth loop already proven by an eight-figure precedent in the identical mechanic (cookie consent). The Omnibus delay is the hidden gift — it pointed every funded GRC vendor at 2027–28 high-risk obligations while the August 2026 transparency deadline hits *every* EU-facing chatbot and AI publisher with nobody selling to them at SMB prices. Ship the free statement template this week, the $99 readiness pack next week, and the widget behind it — and if you want the founder-fit hedge, run CreatorRetain's validation (5 paid retention setups) in parallel; they don't compete for the same hours.

## Watch list

1. **The AI Act Code of Practice on transparency** (drafting now) — when it publishes, it defines exactly what "machine-readable marking" means. That's simultaneously DiscloseKit's biggest content-marketing event and its biggest re-spec risk. Watch the AI Office's drafts monthly.
2. **Hiring's AI doom loop** — the pain is enormous but the tooling side is a funded arms race today. Trigger to re-enter: EU AI Act hiring obligations (Annex III high-risk, now Dec 2027) start generating *compliance* spend rather than screening spend — a documentation/audit wedge solo operators can own, unlike the assessment war. Recheck in 60–90 days.

## Discard pile

| Idea found | Kill reason |
|---|---|
| Voice-AI agent QA/monitoring | Crowded and competent: [Hamming, Cekura, Coval, Roark, ReachAll](https://www.cekura.ai/blogs/best-ai-voice-testing-platforms) all specialized and funded. |
| Etsy AI-disclosure listing scanner (single-platform) | [Free young incumbent already live with shop-sync on the roadmap](https://iscompliant.app/); sub-$20 WTP; survives only as Idea 4's broader wedge. |
| C2PA-as-a-service for small publishers | [6,000-member giants' club](https://c2pa.org/) — Adobe/Microsoft ship it natively; certification infra favors incumbents; solo has no seat at that table. |
| "Proof-of-human" content badges | [World (Altman) owns the identity rails](https://techcrunch.com/2026/03/17/world-launches-tool-to-verify-humans-behind-ai-shopping-agents/), Quillbot gives certificates away free; no solo wedge except the testimonial niche (Idea 5). |
| AI-proof candidate assessment | [15+ funded TestGorilla alternatives](https://testlify.com/testgorilla-alternatives/) in a conversational-AI arms race — capital war, not a solo game. |
| Newsletter migration concierge | Ghost and beehiiv both do white-glove migration **free** as an acquisition cost — you can't out-subsidize the platform. |
| ISO 42001 readiness for AI startups | Vanta/Drata territory; trust-certification incumbents already own the buyer and the auditor network. |
| Skool/Circle/Kajabi wedge product | Review-gap mining found feature-war noise but no broken, recurring complaint to build against — crowded and adequately competent. |
| Full EU AI Act GRC platform for SMBs | The [Omnibus delay to 2027–28](https://www.stibbe.com/publications-and-insights/ai-act-reloaded-what-the-latest-ai-act-changes-mean-in-practice) gutted near-term urgency for the high-risk tier, and GRC is an enterprise-sales motion regardless. |
| Consumer subscription cancel-flow infra | [Churn Buster / Churnkey own it](https://churnbuster.io/articles/best-churn-management-software); creator-stack niche (Idea 2) is the only opening. |

## Method note

12 live searches this batch (29 cumulative across both batches): EU AI Act deadline structure (Article 50, Article 4, Omnibus), community-platform review gaps, proof-of-human/C2PA provenance, voice-AI QA saturation, hiring's AI application flood, marketplace AI-policy shifts (Etsy/Amazon/eBay), Substack/beehiiv/Ghost economics, churn tooling, candidate-assessment saturation, and indie hacker revenue distributions. Sources cited inline per idea.
