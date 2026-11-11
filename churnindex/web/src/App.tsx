import { useEffect } from "react";
import { track } from "./lib/analytics";
import { AnnouncementBar, CompatibilityStrip, Hero } from "./sections/Hero";
import { Calculator, HowItWorks, Leaks, ShareCard, TheIndex } from "./sections/Product";
import { Autopilot, Comparison, Pricing, ReportSignup } from "./sections/Plans";
import { Faq, FinalCta, Footer, Founder, Security } from "./sections/Company";

// Section order follows brief section 13 and the homepage mock.
export default function App() {
  useEffect(() => track("homepage_viewed"), []);
  return (
    <div className="bg-page font-sans leading-[1.55] text-ink [font-variant-numeric:tabular-nums]">
      <AnnouncementBar />
      <Hero />
      <main>
        <CompatibilityStrip />
        <Leaks />
        <Calculator />
        <HowItWorks />
        <TheIndex />
        <ShareCard />
        <Autopilot />
        <Comparison />
        <ReportSignup />
        <Pricing />
        <Founder />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
