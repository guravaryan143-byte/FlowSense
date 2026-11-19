import { Hero } from "../components/landing/Hero";
import { LandingNav } from "../components/landing/LandingNav";
import { LiveSection } from "../components/landing/LiveSection";
import { ClosingCta, LandingFooter, ModulesIndex, Pipeline } from "../components/landing/Sections";

/** Public front door: cinematic hero, then only sections that describe things the app really does. */
export default function Landing() {
  return (
    <div className="bg-ink-950 text-slate-200">
      <a href="#main" className="sr-only z-[60] rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <LandingNav />
      <main id="main">
        <Hero />
        <ModulesIndex />
        <LiveSection />
        <Pipeline />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
