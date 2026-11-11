import { BRAND_NAME, SIGNIN_HREF } from "../config";
import { CheckIcon, Container, LogoMark, Pill, PrimaryCta } from "../components/ui";

const NAV = [
  ["#how", "How it works"],
  ["#index", "The index"],
  ["#pricing", "Pricing"],
  ["#report", "State of Churn"],
];

export function AnnouncementBar() {
  return (
    <div className="bg-deepest text-sm text-white">
      <Container className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 py-2.5 text-center">
        <span className="text-soft-dark">The first State of Churn report for AI-built apps is in the works.</span>
        <a href="#report" className="py-1.5 font-semibold text-white underline underline-offset-[3px] hover:text-soft-dark">
          Get it first
        </a>
      </Container>
    </div>
  );
}

function Header() {
  return (
    <header>
      <Container className="flex flex-wrap items-center justify-between gap-4 py-[18px]">
        <a href="#top" className="flex min-h-[44px] items-center gap-2.5 font-display text-[22px] font-extrabold tracking-[-0.01em] text-white no-underline">
          <LogoMark />
          <span>{BRAND_NAME}</span>
        </a>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-[26px] gap-y-0.5 text-[15px] font-medium">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="hidden py-3 text-soft-dark no-underline hover:text-white md:inline">{label}</a>
          ))}
          <a href={SIGNIN_HREF} className="py-3 text-white no-underline hover:text-soft-dark">Sign in</a>
          <PrimaryCta location="nav" />
        </nav>
      </Container>
    </header>
  );
}

function SampleScorecard() {
  return (
    <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5 rounded-[20px] border border-dark-border bg-raised p-[26px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-[17px] font-bold">Scorecard for yourapp</span>
        <Pill>Sample data</Pill>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1 rounded-[14px] border border-dark-border bg-ink p-[18px]">
          <span className="text-[13px] text-muted-dark">Recoverable every month</span>
          <span className="font-display text-[42px] font-extrabold leading-[1.05] text-accent">$1,240</span>
          <span className="text-[13px] text-muted-dark">of $2,910 lost last month</span>
        </div>
        <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-2.5 rounded-[14px] border border-dark-border bg-ink p-[18px]">
          <span className="text-[13px] text-muted-dark">Retention percentile</span>
          <span className="font-display text-[42px] font-extrabold leading-[1.05]">32nd</span>
          <div className="relative h-2 rounded bg-dark-border">
            <div className="h-2 w-[32%] rounded bg-data-dark" />
            <div className="absolute left-1/2 top-[-4px] h-4 w-0.5 bg-muted-dark" />
          </div>
          <span className="text-xs text-muted-dark">Median for AI apps on $20 to $40 plans is the line</span>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">
        <Bar label="Voluntary churn" detail="5.8% vs 4.1% peers" width="72%" color="bg-accent" />
        <Bar label="Failed payments recovered" detail="38% vs 55% peers" width="38%" color="bg-data-dark" />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-dark-border pt-4">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">Recovered with Autopilot</span>
          <span className="font-semibold text-data-dark">+$1,180 last 30 days</span>
        </div>
        <svg role="img" aria-label="Recovered revenue rising each week after Autopilot was switched on"
          width="100%" height="64" viewBox="0 0 360 64" preserveAspectRatio="none">
          <path d="M0 58 L40 56 L80 57 L120 50 L160 44 L200 36 L240 30 L280 22 L320 16 L360 8" fill="none"
            stroke="#5B8CFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M120 4 L120 62" stroke="#3A4862" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
        <span className="text-xs text-muted-dark">Dotted line marks when Autopilot turned on</span>
      </div>
    </div>
  );
}

function Bar({ label, detail, width, color }: { label: string; detail: string; width: string; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-dark">{detail}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded bg-dark-border">
        <div className={color} style={{ width }} />
      </div>
    </div>
  );
}

export function Hero() {
  const points = ["Read-only Stripe key", "Ready in two minutes", "Free scorecard, always"];
  return (
    <div className="bg-ink text-white">
      <Header />
      <section id="top">
        <Container className="flex flex-wrap items-center gap-14 pb-[88px] pt-16">
          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
            <p className="m-0 flex items-center gap-2.5 text-sm font-semibold text-soft-dark">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" />
              <span>The retention benchmark for subscription apps</span>
            </p>
            <h1 className="m-0 font-display text-[clamp(42px,5.6vw,68px)] font-extrabold leading-none tracking-[-0.03em]">
              Your app is leaking revenue. See exactly how much.
            </h1>
            <p className="m-0 max-w-[540px] text-[19px] text-soft-dark">
              Connect Stripe and get a free churn scorecard in two minutes: what you lose each month, where it goes,
              and how you compare with apps like yours. Then switch on Autopilot to win it back.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryCta location="hero" size="lg" />
              <a href="#calculator" className="rounded-[10px] border border-dark-outline px-[22px] py-[15px] text-[17px] font-semibold text-white no-underline hover:text-soft-dark">
                Estimate my leak
              </a>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-[22px] gap-y-2.5 p-0 text-sm text-muted-dark">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-2"><CheckIcon />{p}</li>
              ))}
            </ul>
          </div>
          <SampleScorecard />
        </Container>
      </section>
    </div>
  );
}

export function CompatibilityStrip() {
  return (
    <section aria-label="Compatibility" className="border-b border-line bg-white">
      <Container className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3.5 py-[26px] text-[15px]">
        <p className="m-0 text-muted">Built for founders shipping on Lovable, Bolt, Replit, Cursor and their own stack.</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-ink px-3.5 py-2 font-bold text-white">Stripe: live now</span>
          {["Paddle", "Lemon Squeezy", "RevenueCat"].map((p) => (
            <span key={p} className="rounded-full border border-[#C5CCD6] px-[13px] py-[7px] font-semibold text-muted">{p}: next</span>
          ))}
        </div>
      </Container>
    </section>
  );
}
