import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/* ------------------------------------------------------------------ modules */

/** Every row opens the real page it describes. Descriptions match what the backend and tests actually do. */
const MODULES = [
  { to: "/traffic", name: "Traffic monitoring", text: "Speed, density and congestion level for every road on a map. Readings stream over a WebSocket while the simulation runs." },
  { to: "/predictions", name: "Congestion prediction", text: "A Random Forest forecasts density and speed ahead of time and is scored against two naive baselines on later data than it trained on." },
  { to: "/signals", name: "Signal optimization", text: "Compare fixed signal timing with adaptive green-time allocation, run on identical simulated arrivals so the comparison is fair." },
  { to: "/emergency", name: "Emergency routing", text: "Dijkstra and A* plan routes for ambulances and fire engines, and re-plan when a road on the route closes." },
  { to: "/accidents", name: "Accident hotspots", text: "DBSCAN clusters simulated accident records into ranked hotspots, with filters for severity, radius and cluster size." },
  { to: "/dashboard", name: "Analytics dashboard", text: "One overview of network health, traffic trends, signal runs and emergency activity." },
  { to: "/incidents", name: "Incident management", text: "Report incidents, close roads and move incidents through their status, with viewer, operator and admin roles." },
] as const;

export function ModulesIndex() {
  return (
    <section id="modules" aria-labelledby="modules-title" className="bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:px-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <h2 id="modules-title" className="text-3xl font-medium leading-tight tracking-[-0.02em] text-paper sm:text-5xl">Seven modules, one simulated city.</h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400 sm:text-lg">
              Each one opens a working page backed by the API. Browsing is open to everyone; signing in unlocks the controls.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-white/10 border-y border-white/10 lg:col-span-8">
          {MODULES.map((m) => (
            <li key={m.to + m.name}>
              <Link to={m.to} className="group grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-1.5 py-6 transition-colors hover:bg-white/[.025] sm:px-3 sm:py-7">
                <span className="text-xl font-medium tracking-tight text-paper sm:text-2xl">{m.name}</span>
                <ArrowUpRight className="mt-1.5 h-5 w-5 text-slate-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                <span className="col-span-2 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:text-base">{m.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pipeline (a real sequence, so numbered) */

const STEPS = [
  { title: "Simulate", text: "A store-and-forward traffic simulator moves vehicles through a fictional road network and writes a reading for every road into PostgreSQL." },
  { title: "Forecast", text: "A Random Forest reads recent conditions and predicts density and speed for each road ahead of time." },
  { title: "Decide", text: "Signals shift green time toward the heavier approach, and emergency routes work around closed roads, both from the same live state." },
  { title: "Show", text: "A FastAPI backend serves REST endpoints and a WebSocket stream. This interface turns them into maps, charts and role-based controls." },
] as const;

export function Pipeline() {
  return (
    <section id="how" aria-labelledby="how-title" className="bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <h2 id="how-title" className="max-w-3xl text-3xl font-medium leading-tight tracking-[-0.02em] text-paper sm:text-5xl">From a simulated vehicle to a decision on screen.</h2>
        <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-white/15 pt-5">
              <span className="text-sm tabular-nums text-accent">{i + 1}</span>
              <h3 className="mt-3 text-xl font-medium tracking-tight text-paper">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing call to action */

export function ClosingCta() {
  const { user } = useAuth();
  return (
    <section aria-labelledby="cta-title" className="border-t border-white/10 bg-ink-950 py-24 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <h2 id="cta-title" className="max-w-4xl font-editorial text-[clamp(2.4rem,6vw,5rem)] font-normal italic leading-[1.05] tracking-[-0.02em] text-paper">
          Explore the simulated city.
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
          Everything is open to browse. Sign in to report incidents and run simulations, and with an operator role, to retime signals and plan emergency routes.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link to="/dashboard" className="inline-flex min-h-12 items-center justify-center rounded-full bg-paper px-7 text-[15px] font-medium text-ink-950 transition hover:bg-white active:scale-[.97]">Open the dashboard</Link>
          {!user && <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-7 text-[15px] text-slate-100 transition hover:border-white/40 hover:bg-white/5">Sign in</Link>}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

const FOOTER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/traffic", label: "Traffic monitoring" },
  { to: "/predictions", label: "AI predictions" },
  { to: "/signals", label: "Signal optimization" },
  { to: "/emergency", label: "Emergency routes" },
  { to: "/accidents", label: "Accident analytics" },
  { to: "/incidents", label: "Incidents" },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink-950 py-12">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-5 sm:px-8 md:grid-cols-[1fr_auto] lg:px-12">
        <div>
          <p className="text-[17px] font-semibold tracking-tight text-slate-50">Flow<span className="text-accent">Sense</span></p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
            AI-powered city traffic intelligence. All traffic data is simulated on a fictional road network.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="inline-flex min-h-11 items-center text-sm text-slate-400 transition hover:text-white">{l.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
