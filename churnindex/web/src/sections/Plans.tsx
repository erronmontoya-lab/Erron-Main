import { useState, type FormEvent, type ReactNode } from "react";
import { AUTOPILOT_PRICE, BRAND_NAME, GROWTH_PRICE, SHOW_GUARANTEE, SIGNUP_HREF } from "../config";
import { CheckIcon, Container, Eyebrow, PrimaryCta, SectionTitle } from "../components/ui";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B1220"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

function SoonTag({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
      dark ? "bg-raised text-soft-dark" : "bg-chip text-muted"}`}>Coming soon</span>
  );
}

// Copy change from the mock: SMS is a Growth feature that is not built yet
// (brief sections 5 and 12), so Autopilot cards say email and SMS is marked
// coming soon.
const FEATURES: { title: string; text: ReactNode; icon: ReactNode }[] = [
  {
    title: "Reason-matched cancel flows",
    text: <>"Too expensive" gets a different answer than "missing a feature." Pause, downgrade or discount, matched to the reason.</>,
    icon: <><path d="M4 6 H20" /><path d="M4 12 H14" /><path d="M4 18 H10" /><path d="M17 15 L20 18 L17 21" /></>,
  },
  {
    title: "Failed-payment recovery",
    text: <>Email reminders timed around your billing retries, with a one-tap page to update the card. SMS reminders are coming to Growth.</>,
    icon: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10 H21" /><path d="M7 15 H10" /></>,
  },
  {
    title: "Win-back sequences",
    text: <>Emails written for each churn reason and sent when past customers are most likely to return.</>,
    icon: <><path d="M4 12 a8 8 0 1 0 3 -6.2" /><path d="M4 4 V9 H9" /></>,
  },
  {
    title: "Recovered revenue report",
    text: <>Every dollar Autopilot brings back, by save type, in one monthly report you can forward to anyone.</>,
    icon: <><path d="M4 19 V5" /><path d="M4 19 H20" /><path d="M8 15 L12 11 L15 13 L19 8" /></>,
  },
];

export function Autopilot() {
  return (
    <section aria-labelledby="auto-title" className="border-y border-line bg-white">
      <Container className="flex flex-col gap-11 py-24">
        <div className="flex max-w-[680px] flex-col gap-3.5">
          <Eyebrow>Autopilot</Eyebrow>
          <SectionTitle id="auto-title">A retention team for apps that will never hire one.</SectionTitle>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-3 rounded-[18px] border border-line bg-page p-[26px]">
              <Icon>{f.icon}</Icon>
              <h3 className="m-0 font-display text-xl font-bold">
                {f.title}
                {f.title === "Win-back sequences" && <SoonTag />}
              </h3>
              <p className="m-0 text-[15px] text-body">{f.text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const ROWS = [
  ["Benchmarks against similar apps", "Yes, across billing providers", "Your own data only", "Your own data only"],
  ["Offers matched to the cancel reason", "Yes, chosen from the index", "Basic survey and coupon", "Yes, configured by hand"],
  ["Failed-payment recovery", "Emails timed to retries, SMS coming soon", "Automatic retries", "Yes"],
  ["Done-for-you setup", "Retention Sprint", "Self-serve", "Varies by plan"],
  ["Starting price", `Free scorecard. Autopilot from $${AUTOPILOT_PRICE} a month`, "Included with billing", "Often $250 a month and up"],
];

export function Comparison() {
  return (
    <section aria-labelledby="compare-title">
      <Container className="flex flex-col gap-9 py-24">
        <div className="flex max-w-[680px] flex-col gap-3.5">
          <Eyebrow>Why {BRAND_NAME}</Eyebrow>
          <SectionTitle id="compare-title">Your billing provider sees your data. {BRAND_NAME} sees the market.</SectionTitle>
        </div>
        <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left">
                <th scope="col" className="w-[28%] border-b border-line px-6 py-5"><span className="sr-only">Feature</span></th>
                <th scope="col" className="border-b border-line bg-ink px-6 py-5 font-display text-lg font-bold text-white">{BRAND_NAME}</th>
                <th scope="col" className="border-b border-line px-6 py-5 font-bold">Built-in billing tools</th>
                <th scope="col" className="border-b border-line px-6 py-5 font-bold">Premium retention suites</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([feature, us, billing, suites], i) => {
                const b = i < ROWS.length - 1 ? "border-b border-line-soft" : "";
                return (
                  <tr key={feature}>
                    <th scope="row" className={`px-6 py-[18px] text-left font-semibold ${b}`}>{feature}</th>
                    <td className={`bg-page px-6 py-[18px] font-semibold ${b}`}>{us}</td>
                    <td className={`px-6 py-[18px] text-muted ${b}`}>{billing}</td>
                    <td className={`px-6 py-[18px] text-muted ${b}`}>{suites}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}

export function ReportSignup() {
  const [submitted, setSubmitted] = useState(false);
  // Not connected yet. Signups will sync to beehiiv (brief section 5, Phase 3).
  // Until then the form stores nothing and says so plainly.
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };
  return (
    <section id="report" aria-labelledby="report-title" className="bg-ink text-white">
      <Container className="flex flex-wrap items-center gap-14 py-24">
        <div className="flex min-w-0 flex-[0_1_300px] justify-center">
          <div className="box-border flex aspect-[3/4] w-[260px] flex-col justify-between rounded-[10px] bg-accent p-[26px] text-ink shadow-[0_30px_70px_rgba(0,0,0,0.5)]">
            <span className="text-xs font-bold tracking-[0.1em]">{BRAND_NAME.toUpperCase()} REPORT</span>
            <div className="flex h-[90px] items-end gap-2" aria-hidden="true">
              {[40, 62, 48, 85, 100].map((h) => (
                <span key={h} className="flex-1 rounded-[3px] bg-ink" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-[30px] font-extrabold leading-none">State of Churn</span>
              <span className="text-sm font-semibold">AI-Built Apps · Edition 01</span>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-[18px]">
          <Eyebrow dark>Quarterly report and weekly email</Eyebrow>
          <SectionTitle id="report-title">The numbers every subscription founder should know.</SectionTitle>
          <p className="m-0 text-[17px] text-soft-dark">
            What good retention looks like at each price point, which saves are working this quarter, and where failed
            payments hurt most. Drawn from the index, written for founders, in your inbox every Tuesday.
          </p>
          <form aria-label="Subscribe to State of Churn" onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
              <label htmlFor="ci-report-email" className="text-sm font-semibold">Work email</label>
              <input id="ci-report-email" type="email" required placeholder="you@yourapp.com"
                className="box-border min-h-[52px] w-full rounded-[10px] border border-[#4A5A78] bg-raised px-4 py-3.5 text-base text-white placeholder:text-muted-dark" />
            </div>
            <button type="submit" className="min-h-[52px] cursor-pointer rounded-[10px] border-0 bg-accent px-[22px] py-[15px] text-base font-bold text-ink hover:brightness-95">
              Send me the report
            </button>
          </form>
          <span className="text-[13px] text-muted-dark" role="status">
            {submitted
              ? "Signups open with the first edition. This form is not saving emails yet."
              : "One email a week. Unsubscribe in one click."}
          </span>
        </div>
      </Container>
    </section>
  );
}

function Plan({ name, tagline, price, features, cta, dark = false, badge, soon = [] }: {
  name: string; tagline: string; price: ReactNode; features: string[]; cta: ReactNode;
  dark?: boolean; badge?: string; soon?: string[];
}) {
  return (
    <div className={`flex flex-col gap-[18px] rounded-[20px] border p-[30px] ${dark
      ? "border-ink bg-ink text-white shadow-[0_24px_60px_rgba(11,18,32,0.22)]" : "border-line bg-white"}`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-display text-[22px] font-bold">{name}</h3>
          {badge && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-ink">{badge}</span>}
        </div>
        <p className={`m-0 text-[15px] ${dark ? "text-soft-dark" : "text-muted"}`}>{tagline}</p>
      </div>
      <div className="font-display text-5xl font-extrabold leading-none">{price}</div>
      <ul className="m-0 flex flex-grow list-none flex-col gap-2.5 p-0 text-[15px]">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <CheckIcon size={18} className={`mt-[3px] ${dark ? "text-accent" : "text-ink"}`} />
            <span>{f}{soon.includes(f) && <SoonTag dark={dark} />}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}

const perMonth = (n: number, dark = false) => (
  <>${n}<span className={`font-sans text-base font-medium ${dark ? "text-muted-dark" : "text-muted"}`}> a month</span></>
);

const outlineCta = "rounded-[10px] border border-ink px-4 py-3.5 text-center text-base font-bold text-ink no-underline hover:bg-page";

export function Pricing() {
  const growthFeatures = ["Everything in Autopilot", "Win-back sequences by churn reason", "SMS payment recovery", "Offer testing against the index"];
  return (
    <section id="pricing" aria-labelledby="pricing-title">
      <Container className="flex flex-col gap-10 pb-24 pt-[100px]">
        <div className="flex max-w-[680px] flex-col gap-3.5">
          <Eyebrow>Pricing</Eyebrow>
          <SectionTitle id="pricing-title">Free to measure. Priced for small apps to fix.</SectionTitle>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-stretch gap-5">
          <Plan name="Scorecard" tagline="Know your numbers." price="Free"
            features={["Churn and recovery metrics, refreshed nightly", "Percentiles against similar apps", "Recoverable revenue estimate", "Shareable found-money card"]}
            cta={<PrimaryCta location="pricing_scorecard" className={`${outlineCta} !bg-transparent`} />} />
          <Plan name="Autopilot" tagline="Stop the two biggest leaks." price={perMonth(AUTOPILOT_PRICE)}
            features={["Everything in Scorecard", "Reason-matched cancel flow", "Failed-payment emails", "Monthly recovered revenue report"]}
            cta={<a href={SIGNUP_HREF} className={outlineCta}>Start Autopilot</a>} />
          <Plan dark name="Growth" tagline="Recover, win back and test." badge="Most recovered" price={perMonth(GROWTH_PRICE, true)}
            features={growthFeatures} soon={growthFeatures.slice(1)}
            cta={<a href={SIGNUP_HREF} className="rounded-[10px] bg-accent px-4 py-[15px] text-center text-base font-bold text-ink no-underline hover:brightness-95">Start Growth</a>} />
        </div>
        {SHOW_GUARANTEE && (
          <p className="m-0 flex items-center gap-2.5 text-[15px] font-semibold text-body">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1220" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" className="flex-none">
              <path d="M12 3 L20 6 V12 c0 4.5 -3.2 7.6 -8 9 c-4.8 -1.4 -8 -4.5 -8 -9 V6 Z" /><path d="M8.5 12 L11 14.5 L15.5 9.5" />
            </svg>
            <span>If Autopilot recovers less than its price in your first 60 days, your next month is free.</span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5 rounded-[20px] border border-line bg-white p-[30px]">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-2">
            <h3 className="m-0 font-display text-[22px] font-bold">Retention Sprint: done for you</h3>
            <p className="m-0 text-base text-body">
              Your cancel flow, payment recovery and win-back program, built by hand and tuned for 90 days. $1,500 setup
              plus 15% of the revenue recovered during the sprint.
            </p>
          </div>
          <a href={SIGNUP_HREF} className="rounded-[10px] bg-ink px-[22px] py-[15px] text-base font-bold text-white no-underline hover:bg-raised">
            Book a sprint call
          </a>
        </div>
      </Container>
    </section>
  );
}
