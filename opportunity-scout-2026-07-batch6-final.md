# Startup Opportunity Scout — July 2026, Batch 6: Final Pull

Sixth and final round. 8 searches (67 cumulative), 6 hypotheses tested under the elite methodology (five kill gates, evidence-anchored vectors, 75 bar). **Result: 1 clear survivor, 5 dead with named killers.** This closes the scouting phase — the dead-to-survivor ratio has stabilized at roughly 5:1 across three elite rounds, which means the search space I can reach through this method is approaching exhaustion. Recommendation at the end.

**Exclusion check:** survivor is clean — no SMB networking/relationship overlap.

---

## Survivor — DROPkit: managed DROP compliance for California data brokers — **78/110 · CLEARS**

**What it is:** A managed integration + evidence system for the ~500 registered California data brokers who, starting **August 1, 2026**, [must poll the state's DROP deletion platform at least every 45 days, hash-match consumer deletion lists per the state's published spec, propagate deletions to service providers, and keep proof](https://privacy.ca.gov/data-brokers/). DROPkit does the API polling, the hashing/matching, the service-provider directives, and — the real product — the compliance evidence log, at $199–599/mo. Second act: [2028's mandatory independent audits](https://www.troutmanprivacy.com/2025/12/analyzing-the-california-delete-act-regulations/) make the evidence log the audit-prep artifact.

**Core value:** The penalty math is the pitch: [$200 per deletion request per day of non-compliance](https://www.datagrail.io/blog/regulations/the-delete-act-and-drop-what-you-need-to-know/) — a broker sitting on a 1,000-request backlog accrues $200K of exposure *per day*. Consumers began registering January 1; the deletion lists will be large on day one. [The API + sandbox opened this spring](https://www.datagrail.io/blog/regulations/the-delete-act-and-drop-what-you-need-to-know/); manual CSV handling is error-prone at exactly the moment errors are priced at $200/day each. And [CalPrivacy is already enforcing the registration side](https://www.clarkhill.com/news-events/news/is-your-business-a-data-broker-californias-drop-goes-live-and-calprivacy-continues-to-enforce-delete-act/) — this regulator shows up.

**Why nobody's looking:** the buyer is unfashionable. OneTrust and DataGrail [publish about the Delete Act](https://www.onetrust.com/blog/californias-drop-what-the-delete-act-changes-for-consent-preferences-and-data-deletion/) but their motion is $50K+ enterprise privacy platforms sold to consumer brands — they are not building a $299/mo DROP poller for small people-search and list brokers (ACV mismatch + reputational distaste, the same dynamic that left CompanionKit's segment empty). G3 passes on segment orthogonality, flagged honestly: they could ship DROP connectors for *their existing* customers; the unserved tail is everyone too small for them.

**The unusual advantage:** the TAM is a *published list* — California maintains a public registry of every registered data broker. Complete named prospect universe, zero discovery cost, deadline-driven urgency. Outbound to a finite registry replaces the growth loop this idea honestly lacks.

**Gate check:** G1 ✓ brokers pay privacy counsel and registration fees today at named prices · G2 ✗→flagged — the weakest gate; scored 5 accordingly · G3 ✓ orthogonal segment (see above) · G4 ✓ deadline is in 29 days; first invoice inside it · G5 ✓ statute, not platform.

**Scorecard:** Pain 9 ($200/request/day compounding math; active enforcer) · Timing 9 (effective Aug 1 — 29 days) · AI exposure 8 (statute-driven, AI-independent) · **Loop 5×2** (honest failure: no mechanical loop; partial substitute is shared-counsel referrals and the audit-artifact circulating to the auditor ecosystem — and the named-registry TAM makes loop-free acquisition viable for once) · **Saturation 8×2** (zero DROP-specific products found; law firms + wrong-segment enterprise platforms only) · Solo 7 (well-specified state API + published hashing spec; small fixed TAM = low support volume) · Fit 5 (not growth-marketing turf; the registry-outbound motion mitigates) · Unit econ 8 ($199–599/mo; 30 customers = $6–18K MRR; panic-shortened sales cycle) · Defensibility 6 (evidence-log switching costs + audit-prep lock-in; the niche's smallness *is* the moat — too small to attract funded entrants).

**The one hard question:** Is the TAM ceiling acceptable? ~500 registered brokers (plus unregistered ones the enforcement wave will flush out) caps this around $15–25K MRR forever. It's a niche cash machine with a 2028 audit second act — not a scalable company. For a nights-and-weekends operator wanting dependable compliance revenue, that may be exactly right; for someone wanting a compounding growth asset, it isn't.

**Validation (2 weeks, move 1 no-code):** (1) Pull the public data broker registry; email 25 small brokers: "DROP polling becomes mandatory Aug 1 — who on your team owns the 45-day cycle?" Count panicked replies. (2) Offer 5 beta seats at $199/mo for white-glove first-cycle handling (manually run their hash-match in the sandbox). (3) Ship the automated poller only after 5 paying; publish "The DROP readiness report: we surveyed X brokers" for law firms to cite (they will — it feeds their client alerts).

**Revenue + ceiling:** $199–599/mo + audit-prep packages in 2027–28. 12-month solo ceiling ≈ **$10–20K MRR**, hard-capped but durable, with regulatory lock-in doing the retention work.

---

## The dead pile — 5 hypotheses, named killers

| Hypothesis | Gate | Killer |
|---|---|---|
| **Illinois HB 3773 AI-hiring kit for SMB employers** (effective Jan 1, 2026, strict liability, applies from 1 employee) | G3 | [Warden AI already publishes the HB 3773 compliance guide](https://www.warden-ai.com/illinois-human-rights-act-amendment-hb-3773-guide) — AI-assurance vendors are circling; and HR platforms (Gusto/Rippling tier) will ship free notice templates the moment enforcement starts. Watch trigger: first IDHR enforcement action revives a narrow notice-and-evidence kit. |
| **Colorado AI Act deployer tooling** | G4 | [The act everyone prepared for no longer exists — replaced before taking effect, obligations substantially reduced](https://www.littler.com/news-analysis/asap/colorado-amends-its-artificial-intelligence-law-substantially-reducing). No obligation, no invoice. |
| **ORM for AI answers** (hallucination correction for brands) | G3 | [Five Blocks already ships AIQ™](https://www.fiveblocks.com/knowledge/ai-search-chatbots/what-is-an-ai-hallucination-and-how-does-it-affect-brand-reputation/) and the established ORM industry is pivoting en masse; GEO monitoring tools are adjacent on the other flank. Crowded from two directions at once. |
| **ChatGPT ad library / competitive intelligence** (ads launched Feb 9, 2026) | G3 | Looked perfect for one search-cycle — then verification found [AdSpyder's ChatGPT Ad Library already live](https://adspyder.io/chatgpt-ad-library) and [Focal bundling one into every plan](https://www.tryfocal.com/blog/chatgpt-ads-library); management platforms already listicled. On top: [the EU is moving to designate ChatGPT a VLOSE](https://cybernews.com/ai-news/european-union-chatgpt/) (~159M EU users vs. the 45M threshold), which would force official ad transparency and compress third-party libraries. |
| **ChatGPT ads management tooling** | G3 | [Multiple platforms already ranked in buyer's guides](https://www.evertune.ai/resources/insights-on-ai/best-chatgpt-ads-management-platforms-in-2026) five months after ads launched. The window for this layer was measured in weeks and it's shut. |

**The instructive one is the ChatGPT ad library:** the thesis was right (no official transparency, private contextual ads, real advertiser intel budgets) — but two products beat the scan there. Surfaces attached to money now saturate in *months*. Regulatory seams saturate in *years* because law firms can't productize and funded vendors won't chase small ACVs. That asymmetry is the single most useful pattern from all six batches.

---

# Closing the scouting phase

## Final elite leaderboard (all six batches, 67 searches, 22 scored ideas, 37 dead hypotheses)

| Rank | Idea | Score | Character |
|---|---|---|---|
| 1 | **PromptShare** (B1) — intent-share tracker for ChatGPT apps | **84** | The only idea that lost nothing to the gates. Data moat, mechanical loop, verified-empty twice. The company. |
| 2 | **TrafficLens** (B4) — AI-traffic measurement hygiene | **82** | Deepest founder fit on the board; buyer is your peer group. |
| 2 | **DiscloseKit** (B2) — Article 50 AI-disclosure kit | **82** | Hardest deadline (Aug 2 — 30 days). The iubenda precedent. |
| 4 | **RateCard** (B3) — B2B creator rate benchmarks | **79** ⚠️ | Best loop mechanics found anywhere; blocked only by your employment-conflict ruling. |
| 5 | **CompanionKit** (B5) — SB 243 compliance | **78** | Statute seam, private right of action, zero products. |
| 5 | **DROPkit** (B6) — Delete Act DROP compliance | **78** | Purest deadline play; hard TAM cap; loop-free but registry-outbound viable. |
| 7 | FeedFixer / PluginReclaim | 77 | Both capped by platform-hostage gates. |
| 9 | CreatorRetain | 75 | At bar; beehiiv circling its own gap. |
| — | BallotLabel / AgeGate | 75 | Seasonal sprint / needs a dev co-founder. |

## The durable asset from six batches

Two repeatable scanners emerged that outlast any single idea:

1. **The statute seam** *(regulatory)*: law effective <12 months + indie-operator-dense segment + per-violation penalties with private enforcement + only law firms publishing. Produced DiscloseKit, CompanionKit, DROPkit, BallotLabel, AgeGate. Re-run every January and July against new effective dates. Saturates in years, not months.
2. **The guides-not-products gap** *(behavioral)*: abundant practitioner workaround content + zero SaaS = proven demand, absent supply. Produced TrafficLens, CiteRate, PromptShare's original find. Verify hard — the ChatGPT ad library shows this gap can close inside one quarter when ad money is attached.

## Final recommendation

Stop scouting; start validating. The last two rounds produced one survivor each from 17 hypotheses — the method is hitting diminishing returns at this strictness level, which is the correct stopping signal. The board holds three distinct shapes at the top: **PromptShare** (compounding data asset, the real company), **DiscloseKit** (30-day deadline sprint, fastest proof you can ship revenue), and **TrafficLens** (founder-fit annuity). A rational 90-day plan runs DiscloseKit's validation sprint *now* (its window literally expires), uses its revenue proof as momentum, and builds PromptShare as the main act — with RateCard held pending your conflict ruling. Next deliverable, if wanted: the two-week validation sprint plan for that sequence.

## Method note

8 searches this batch: IL/CO AI-employment law status, ChatGPT ads ecosystem (×3), AI-hallucination ORM landscape, Delete Act/DROP structure (×2). 67 searches cumulative across six batches. Sources inline throughout.
