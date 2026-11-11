import { useRef, useState, type ReactNode } from "react";
import { BRAND_NAME } from "../config";
import { Container, Eyebrow, Pill, PrimaryCta, SectionTitle } from "../components/ui";
import { estimateLeak, formatDollars } from "../lib/calculator";
import { track } from "../lib/analytics";

const LEAKS = [
  {
    label: "The day-zero exit",
    stat: "Over half",
    text: "of trial cancellations happen on the first day. Your onboarding decides who stays before your first email goes out.",
    source: "Source: RevenueCat, State of Subscription Apps 2026",
  },
  {
    label: "The silent card decline",
    stat: "1 in 4",
    text: "cancellations come from a failed payment. These customers still want your product. Their card simply stopped working.",
    source: "Source: Stripe research on involuntary churn",
  },
  {
    label: "The AI app gap",
    stat: "21% vs 31%",
    text: "annual retention for AI apps compared with other subscription apps. AI apps earn more per payer and lose them faster.",
    source: "Source: RevenueCat, State of Subscription Apps 2026",
  },
];

export function Leaks() {
  return (
    <section aria-labelledby="leaks-title">
      <Container className="flex flex-col gap-10 pb-10 pt-24">
        <div className="flex max-w-[680px] flex-col gap-3.5">
          <Eyebrow>Where small apps lose money</Eyebrow>
          <SectionTitle id="leaks-title">Three leaks drain most subscription apps. Few founders measure any of them.</SectionTitle>
        </div>
        <div className="flex flex-wrap gap-5">
          {LEAKS.map((l) => (
            <article key={l.label} className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-[18px] border border-line bg-white p-[30px]">
              <span className="text-sm font-bold text-muted">{l.label}</span>
              <span className="font-display text-[44px] font-extrabold leading-none">{l.stat}</span>
              <p className="m-0 text-base text-body">{l.text}</p>
              <span className="mt-auto text-xs text-muted">{l.source}</span>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Calculator() {
  const [mrr, setMrr] = useState(12000);
  const [churn, setChurn] = useState(6);
  const reported = useRef(false);
  const r = estimateLeak(mrr, churn);

  const onUse = () => {
    if (!reported.current) {
      reported.current = true;
      track("calculator_used");
    }
  };

  return (
    <section id="calculator" aria-labelledby="calc-title">
      <Container className="pb-24 pt-10">
        <div className="flex flex-wrap overflow-hidden rounded-3xl border border-line bg-white">
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-7 p-6 sm:p-11">
            <div className="flex flex-col gap-3">
              <h2 id="calc-title" className="m-0 font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.02em]">
                What is churn costing you?
              </h2>
              <p className="m-0 text-base text-muted">
                Move the sliders for a quick estimate. Your free scorecard replaces it with your real numbers.
              </p>
            </div>
            <Slider id="ci-mrr" label="Monthly recurring revenue" display={formatDollars(mrr)}
              min={1000} max={150000} step={1000} value={mrr}
              onChange={(v) => { setMrr(v); onUse(); }} />
            <Slider id="ci-churn" label="Monthly churn rate" display={`${churn.toFixed(1)}%`}
              min={1} max={15} step={0.5} value={churn}
              onChange={(v) => { setChurn(v); onUse(); }} />
            <p className="m-0 text-[13px] text-muted">
              Estimate assumes a quarter of churn comes from failed payments (Stripe research) and that Autopilot
              saves 3 in 10 at-risk subscriptions.
            </p>
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col justify-center gap-6 bg-ink p-6 text-white sm:p-11" aria-live="polite">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-dark">You lose about</span>
              <span className="font-display text-[52px] font-extrabold leading-[1.05]">
                {formatDollars(r.lost)}<span className="font-sans text-lg font-medium text-muted-dark"> a month</span>
              </span>
              <span className="text-sm text-muted-dark">
                {formatDollars(r.lostYear)} a year: {formatDollars(r.voluntary)} from cancellations,{" "}
                {formatDollars(r.failed)} from failed payments
              </span>
            </div>
            <div className="h-px bg-dark-border" />
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-dark">Autopilot could win back</span>
              <span className="font-display text-[52px] font-extrabold leading-[1.05] text-accent">
                {formatDollars(r.recoverable)}<span className="font-sans text-lg font-medium text-muted-dark"> a month</span>
              </span>
              <span className="text-sm text-muted-dark">
                {formatDollars(r.recoverableYear)} a year
                {r.priceMultiple >= 2 && <>, about {r.priceMultiple}x the price of Autopilot</>}
              </span>
            </div>
            <PrimaryCta location="calculator" label="Get my real numbers" className="self-start px-6 py-[15px] text-base" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function Slider({ id, label, display, min, max, step, value, onChange }: {
  id: string; label: string; display: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-semibold">{label}</label>
        <span className="font-display text-[22px] font-bold">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-full accent-ink" />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-y border-line bg-white">
      <Container className="flex flex-col gap-11 py-24">
        <div className="flex max-w-[640px] flex-col gap-3.5">
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle id="how-title">Measure it free. Fix it when the numbers say so.</SectionTitle>
        </div>
        <ol className="m-0 flex list-none flex-wrap gap-5 p-0">
          <Step n={1} title="Connect" text="Paste a read-only Stripe key. Your scorecard builds in about two minutes and refreshes every night.">
            <div className="rounded-[10px] border border-line bg-white px-3.5 py-3 font-mono text-sm text-muted">rk_live_••••••••••••4f2a</div>
          </Step>
          <Step n={2} title="Compare" text="See your percentile against apps with the same price point, billing cadence and build stack.">
            <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-white p-3.5">
              <div className="h-2 rounded bg-chip"><div className="h-2 w-[32%] rounded bg-ink" /></div>
              <div className="h-2 rounded bg-chip"><div className="h-2 w-1/2 rounded bg-[#9AA5B4]" /></div>
              <span className="text-xs text-muted">You vs peer median</span>
            </div>
          </Step>
          <Step n={3} title="Recover" text="Switch on Autopilot. It runs the saves with the best record for apps like yours and reports every dollar back.">
            <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-line bg-white px-3.5 py-3 text-sm">
              <span className="text-muted">Recovered this month</span>
              <span className="font-bold text-data-light">+$1,180</span>
            </div>
          </Step>
        </ol>
      </Container>
    </section>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-[18px] border border-line bg-page p-7">
      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ink font-display text-lg font-extrabold text-white">{n}</span>
      <h3 className="m-0 font-display text-2xl font-bold">{title}</h3>
      <p className="m-0 text-base text-body">{text}</p>
      <div className="mt-auto">{children}</div>
    </li>
  );
}

const SAVES = [
  ["Not using it enough", "Pause for one month", "41%"],
  ["Too expensive", "30% off for three months", "34%"],
  ["Missing a feature", "Roadmap note and a lower plan", "18%"],
  ["Switching to another tool", "Annual plan offer", "12%"],
];

export function TheIndex() {
  return (
    <section id="index" aria-labelledby="index-title" className="bg-ink text-white">
      <Container className="flex flex-wrap items-center gap-14 py-[100px]">
        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-[18px]">
          <Eyebrow dark>The index</Eyebrow>
          <SectionTitle id="index-title">Your app sees a few hundred cancellations. The index sees all of them.</SectionTitle>
          <p className="m-0 text-[17px] text-soft-dark">
            Every connected app adds anonymous outcomes to the index: which offer was shown, for which cancel reason,
            at which price, and whether the customer stayed. Autopilot uses that record to choose your saves, so you
            start with what already works instead of guessing.
          </p>
          <p className="m-0 text-[17px] text-soft-dark">The more apps that connect, the sharper every scorecard and every save becomes.</p>
        </div>
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-[20px] border border-dark-border bg-raised p-[26px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-[17px] font-bold">Best saves by cancel reason</span>
            <Pill>Illustrative</Pill>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted-dark">
                  <th scope="col" className="border-b border-dark-border px-2 py-2.5 font-semibold">Cancel reason</th>
                  <th scope="col" className="border-b border-dark-border px-2 py-2.5 font-semibold">Best performing save</th>
                  <th scope="col" className="border-b border-dark-border px-2 py-2.5 text-right font-semibold">Save rate</th>
                </tr>
              </thead>
              <tbody>
                {SAVES.map(([reason, save, rate], i) => {
                  const b = i < SAVES.length - 1 ? "border-b border-dark-border" : "";
                  return (
                    <tr key={reason}>
                      <td className={`px-2 py-3.5 ${b}`}>{reason}</td>
                      <td className={`px-2 py-3.5 text-soft-dark ${b}`}>{save}</td>
                      <td className={`px-2 py-3.5 text-right font-bold text-accent ${b}`}>{rate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="text-xs text-muted-dark">Real rates appear for each cohort once it is large enough to keep every app anonymous.</span>
        </div>
      </Container>
    </section>
  );
}

export function ShareCard() {
  return (
    <section aria-labelledby="share-title">
      <Container className="flex flex-wrap items-center gap-14 py-[100px]">
        <div className="order-2 flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>Share card</Eyebrow>
          <SectionTitle id="share-title">Share the money you found, never your rank.</SectionTitle>
          <p className="m-0 text-[17px] text-body">
            Every scorecard comes with a card you can post: the revenue you can win back, with no churn rate and no
            percentile on it. Founders love posting a found-money number, and every post brings the next founder to
            the index.
          </p>
          <PrimaryCta location="share_card" label="Make my card"
            className="self-start !bg-ink px-[22px] py-[15px] text-base !text-white" />
        </div>
        <div className="order-1 flex min-w-0 flex-[1_1_420px] justify-center">
          <div className="flex w-full max-w-[460px] flex-col gap-3.5 rounded-[18px] border border-line bg-white p-[22px] shadow-[0_20px_50px_rgba(11,18,32,0.10)]">
            <div className="flex items-center gap-3">
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-chip text-[15px] font-bold text-body">YA</span>
              <div className="flex flex-col leading-[1.3]">
                <span className="text-[15px] font-bold">Your App</span>
                <span className="text-[13px] text-muted">@yourapp</span>
              </div>
            </div>
            <p className="m-0 text-base">Ran my numbers on {BRAND_NAME}. Found $1,240 a month I can win back. Switching on Autopilot tonight.</p>
            <div className="flex flex-col gap-1.5 rounded-[14px] bg-ink p-6 text-white">
              <span className="text-[13px] font-semibold text-muted-dark">{BRAND_NAME} scorecard</span>
              <span className="font-display text-[46px] font-extrabold leading-[1.05] text-accent">$1,240</span>
              <span className="text-[15px]">recoverable every month</span>
              <span className="mt-2.5 text-[13px] text-muted-dark">Get your free scorecard at {BRAND_NAME}</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
