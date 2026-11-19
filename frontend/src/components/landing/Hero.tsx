import { ArrowDown } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import landSignal from "../../assets/hero/hero-land-signal.webp";
import landStreet from "../../assets/hero/hero-land-street.webp";
import portSignal from "../../assets/hero/hero-port-signal.webp";
import portStreet from "../../assets/hero/hero-port-street.webp";
import { LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER } from "../../utils/congestion";
import { LayerImage, RevealLayer } from "../RevealLayer";

/** Intersections in the artwork where several ribbons meet, so the lens always has something to reveal. */
const FOCUS = {
  landscape: { x: 0.77, y: 0.689, imageWidth: 2560, imageHeight: 1440 },
  portrait: { x: 0.374, y: 0.304, imageWidth: 1200, imageHeight: 1800 },
};

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

/** What the revealed layer's colours mean. Drawn from the same tokens the app's maps and badges use. */
function Legend() {
  return (
    <ul aria-label="Congestion colours in the revealed layer" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEVEL_ORDER.filter((l) => l !== "closed").map((level) => (
        <li key={level} className="flex items-center gap-2 text-xs text-slate-300">
          <span aria-hidden className="h-[3px] w-5 rounded-full" style={{ background: LEVEL_COLOR[level], boxShadow: `0 0 10px ${LEVEL_COLOR[level]}` }} />
          {LEVEL_LABEL[level]}
        </li>
      ))}
    </ul>
  );
}

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative isolate h-[100dvh] min-h-[620px] overflow-hidden bg-ink-950 text-slate-100">
      {/* layer 1: the street at dusk */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true"><LayerImage src={landStreet} portraitSrc={portStreet} /></div>
      {/* legibility: dim the STREET layer behind the copy. This sits below the lens, so the data layer stays vivid even over the headline */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/45 to-ink-950/10 sm:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(7,13,26,.88)_0%,rgba(7,13,26,.6)_34%,rgba(7,13,26,.05)_68%)] sm:block" />

      {/* layer 2: the same streets as FlowSense reads them, visible only under the spotlight */}
      <RevealLayer src={landSignal} portraitSrc={portSignal} focus={FOCUS} />

      {/* melt the bottom edge into the page */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-24 sm:px-8 lg:px-12">
        <h1 id="hero-title" className="max-w-[16ch] text-[clamp(2.5rem,7.4vw,6.2rem)] font-medium leading-[1.01] tracking-[-0.035em] text-paper sm:max-w-[13ch]">
          <span className="rise block" style={delay(150)}>Traffic has a second layer.</span>
          <span className="rise block font-editorial text-[1.06em] font-normal italic tracking-[-0.02em] text-white" style={delay(330)}>FlowSense reads it.</span>
        </h1>

        <p className="rise mt-5 max-w-[34rem] text-base leading-relaxed text-slate-300 sm:text-lg" style={delay(560)}>
          An AI traffic-intelligence platform for a simulated city. It monitors congestion, forecasts it ahead of time,
          retimes signals and routes ambulances and fire engines around closures.
        </p>

        <div className="rise mt-7 flex flex-wrap items-center gap-3" style={delay(720)}>
          <Link to="/dashboard" className="inline-flex min-h-12 items-center justify-center rounded-full bg-paper px-7 text-[15px] font-medium text-ink-950 transition hover:bg-white active:scale-[.97]">
            Open the dashboard
          </Link>
          <a href="#how" className="inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[15px] text-slate-200 transition hover:text-white">
            See how it works <ArrowDown className="h-4 w-4" aria-hidden />
          </a>
        </div>

        <div className="rise mt-10 flex flex-col gap-4 border-t border-white/10 pt-5 sm:mt-14 lg:flex-row lg:items-center lg:justify-between" style={delay(900)}>
          <p className="max-w-xl text-xs leading-relaxed text-slate-400">
            <span className="hidden [@media(hover:hover)]:inline">Move your cursor across the city to read the data layer. </span>
            <span className="[@media(hover:hover)]:hidden">Drag a finger across the city to read the data layer. </span>
            Fictional road network. Every vehicle and reading is simulated.
          </p>
          <Legend />
        </div>
      </div>
    </section>
  );
}
