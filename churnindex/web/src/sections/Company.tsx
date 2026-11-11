import { BRAND_NAME } from "../config";
import { Container, Eyebrow, PrimaryCta, SectionTitle } from "../components/ui";

export function Founder() {
  return (
    <section aria-labelledby="founder-title" className="border-y border-line bg-white">
      <Container className="flex flex-wrap items-center gap-14 py-24">
        {/* Open decision: founder photo (brief section 14, item 5). */}
        <div className="flex aspect-[4/5] min-w-0 flex-[0_1_300px] items-center justify-center rounded-[20px] bg-chip text-[15px] font-semibold text-muted">
          Founder photo
        </div>
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5">
          <Eyebrow>Built by a retention operator</Eyebrow>
          <h2 id="founder-title" className="m-0 font-display text-[clamp(26px,3vw,34px)] font-bold leading-[1.2] tracking-[-0.01em]">
            "Every small app deserves the numbers a retention team would hand it. {BRAND_NAME} gives founders those
            numbers on day one, then does the work to move them."
          </h2>
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold">Erron Montoya, founder</span>
            {/* Open decision: bio wording (brief section 14, item 5). Confirm every claim before launch. */}
            <span className="text-[15px] text-muted">
              Formerly Customer Retention Lead at AWS. Led lifecycle marketing for [solidcore] and demand generation for
              Grammarly for Business. Co-founded two companies that were acquired.
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}

const TRUST = [
  ["Read-only by default", "The scorecard runs on a restricted key with read access. Autopilot asks for more only for the actions you switch on."],
  ["Anonymous benchmarks", "The index only shows a cohort once it is large enough that no single app can be identified."],
  ["One-click delete", "Disconnect at any time and every record from your account is deleted."],
  ["Honest cancel flows", "The cancel button stays visible on every screen, built to follow automatic renewal laws such as California's."],
];

export function Security() {
  return (
    <section aria-labelledby="trust-title">
      <Container className="flex flex-col gap-10 py-24">
        <div className="flex max-w-[680px] flex-col gap-3.5">
          <Eyebrow>Security and data use</Eyebrow>
          <SectionTitle id="trust-title">Your billing data stays yours.</SectionTitle>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          {TRUST.map(([title, text]) => (
            <div key={title} className="flex flex-col gap-2.5">
              <h3 className="m-0 font-display text-[19px] font-bold">{title}</h3>
              <p className="m-0 text-[15px] text-body">{text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const FAQ = [
  ["Is the scorecard really free?", "Yes. The scorecard stays free for as long as you stay connected. Every connected app makes the benchmark more accurate for everyone, which is the trade."],
  ["What access do you need to my Stripe account?", "A restricted key with read access to subscriptions, invoices and customers. The scorecard never changes anything in your account."],
  ["Who am I compared with?", "Apps with a similar price point, billing cadence and category. You see percentiles and medians, never another app's name or numbers."],
  ["How is this different from my billing provider's tools?", `Billing tools work from your data alone. ${BRAND_NAME} learns from outcomes across every connected app and every billing provider, so it can tell you what good looks like and which save works for each reason.`],
  ["I don't use Stripe. Can I still join?", "Paddle, Lemon Squeezy and RevenueCat are next. Join the report list and you will hear the day your provider goes live."],
  ["Will a cancel flow annoy my customers?", "Each flow is one short screen with one relevant offer and a cancel button that is always in view. Customers who want to leave can leave in a click."],
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <Container className="flex flex-wrap gap-x-14 gap-y-10 pb-[100px]">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <Eyebrow>Questions</Eyebrow>
          <SectionTitle id="faq-title">Before you connect</SectionTitle>
        </div>
        <div className="flex min-w-0 flex-[2_1_560px] flex-col border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="border-b border-line">
              <summary className="flex min-h-[44px] items-center justify-between gap-4 py-[22px] text-[17px] font-bold">
                {q}
                <svg className="faq-plus flex-none" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none"
                  stroke="#0B1220" strokeWidth="2" strokeLinecap="round"><path d="M10 4 V16" /><path d="M4 10 H16" /></svg>
              </summary>
              <p className="m-0 mb-[22px] max-w-[640px] text-base text-body">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section id="connect" aria-labelledby="cta-title" className="bg-ink text-white">
      <Container className="flex flex-col items-center gap-[22px] py-[100px] text-center">
        <h2 id="cta-title" className="m-0 max-w-[820px] font-display text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
          Find out what churn is costing you this month.
        </h2>
        <p className="m-0 max-w-[560px] text-lg text-soft-dark">
          Two minutes, read-only and free. Your scorecard is waiting on the other side of one key.
        </p>
        <PrimaryCta location="final_cta" size="xl" />
      </Container>
    </section>
  );
}

const FOOTER_NAV: [string, [string, string][]][] = [
  ["Product", [["#how", "How it works"], ["#index", "The index"], ["#pricing", "Pricing"]]],
  ["Resources", [["#report", "State of Churn"], ["#calculator", "Churn calculator"], ["#faq", "Questions"]]],
  // Privacy and Terms pages come with Phase 1 (brief section 11).
  ["Company", [["#trust-title", "Security and data use"], ["#privacy", "Privacy"], ["#terms", "Terms"]]],
];

export function Footer() {
  return (
    <footer className="bg-deepest text-white">
      <Container className="flex flex-col gap-10 pb-9 pt-14">
        <div className="flex flex-wrap justify-between gap-x-14 gap-y-8">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
            <span className="font-display text-[22px] font-extrabold">{BRAND_NAME}</span>
            <span className="max-w-[300px] text-[15px] text-muted-dark">The retention benchmark and autopilot for subscription apps.</span>
          </div>
          {FOOTER_NAV.map(([title, links]) => (
            <nav key={title} aria-label={title} className="flex flex-col gap-0.5 text-[15px]">
              <span className="pb-1.5 font-bold">{title}</span>
              {links.map(([href, label]) => (
                <a key={label} href={href} className="py-2 text-muted-dark no-underline hover:text-white">{label}</a>
              ))}
            </nav>
          ))}
        </div>
        <div className="border-t border-[#1E2A40] pt-[22px] text-[13px] text-[#8C97AB]">
          © {new Date().getFullYear()} {BRAND_NAME}. Benchmarks are anonymized and aggregated.
        </div>
      </Container>
    </footer>
  );
}
