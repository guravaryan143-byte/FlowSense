import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { useLiveTraffic } from "../../hooks/useLiveTraffic";
import { getModelInfo } from "../../services/endpoints";
import type { LiveTraffic, ModelInfo } from "../../types";
import { LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER } from "../../utils/congestion";
import { fmtDateTime, fmtDec, fmtInt } from "../../utils/format";
import { DataBoundary, Pill } from "../ui";

const PANEL = "rounded-2xl border border-white/10 bg-ink-900/60 p-5 sm:p-7";

/* ------------------------------------------------------------------ the network right now */

function NetworkNow({ data, streaming }: { data: LiveTraffic; streaming: boolean }) {
  const s = data.summary;
  const parts = LEVEL_ORDER.map((level) => ({ level, count: s.level_counts[level] ?? 0 })).filter((p) => p.count > 0);
  const summary = parts.map((p) => `${p.count} ${LEVEL_LABEL[p.level].toLowerCase()}`).join(", ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="cyan">Simulated data</Pill>
        {streaming ? <Pill tone="green">Updating live</Pill> : <Pill>Refreshes every 10 s</Pill>}
        <span className="text-xs text-slate-500">Latest reading {fmtDateTime(s.as_of)}</span>
      </div>

      <p className="mt-6 text-sm text-slate-400">{s.road_count} roads, by congestion level</p>
      <div role="img" aria-label={`Congestion across ${s.road_count} roads: ${summary}`} className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.level} style={{ flexGrow: p.count, background: LEVEL_COLOR[p.level] }} className="min-w-1.5 first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.level} className="flex items-center gap-2 text-sm text-slate-300">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[p.level] }} />
            {LEVEL_LABEL[p.level]} <span className="tabular-nums text-slate-500">{p.count}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
        <div><dt className="text-xs text-slate-500">Vehicles on the network</dt><dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-paper sm:text-3xl">{fmtInt(s.total_vehicles)}</dd></div>
        <div><dt className="text-xs text-slate-500">Average speed</dt><dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-paper sm:text-3xl">{fmtDec(s.average_speed)}<span className="ml-1 text-sm text-slate-500">km/h</span></dd></div>
        <div><dt className="text-xs text-slate-500">Heavy or severe</dt><dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight text-paper sm:text-3xl">{s.congested_roads}<span className="ml-1 text-sm text-slate-500">of {s.open_roads}</span></dd></div>
      </dl>

      <Link to="/traffic" className="group mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:text-cyan-200">
        Open the live map <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ how good is the forecast */

const BARS: { key: string; label: string; note: string; hero?: boolean }[] = [
  { key: "random_forest", label: "Random Forest", note: "FlowSense model", hero: true },
  { key: "baseline_persistence", label: "Persistence", note: "assume nothing changes" },
  { key: "baseline_historical_mean", label: "Historical mean", note: "the usual value for that time" },
];

function ForecastEvidence({ info }: { info: ModelInfo }) {
  const rows = BARS.map((b) => ({ ...b, mae: info.metrics[b.key]?.target_density.mae })).filter((r): r is typeof r & { mae: number } => typeof r.mae === "number");
  const max = Math.max(...rows.map((r) => r.mae), 0.0001);
  const better = info.density_mae_improvement_vs_persistence_pct;

  return (
    <div>
      <p className="text-sm text-slate-400">Density error {info.horizon_minutes} minutes ahead, in vehicles per km per lane. Lower is better.</p>
      <ul className="mt-5 space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={r.hero ? "font-medium text-paper" : "text-slate-300"}>{r.label} <span className="text-xs font-normal text-slate-500">{r.note}</span></span>
              <span className="tabular-nums text-slate-300">{r.mae.toFixed(2)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-white/5" aria-hidden>
              <div className={`h-full rounded-full ${r.hero ? "bg-accent" : "bg-slate-500/70"}`} style={{ width: `${Math.max(2, (r.mae / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {better !== null && better !== undefined && (
        <p className="mt-6 text-sm text-slate-300">
          {better >= 0 ? `${fmtDec(better)}% lower error than persistence.` : `${fmtDec(Math.abs(better))}% higher error than persistence.`}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Trained on {fmtInt(info.n_train)} readings and scored on {fmtInt(info.n_test)} later ones. The data is simulated, so this measures the
        model against the simulator, not against real roads.
      </p>
      <Link to="/predictions" className="group mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:text-cyan-200">
        See forecasts per road <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ section */

export function LiveSection() {
  const live = useLiveTraffic();
  const model = useAsync(getModelInfo, []);

  return (
    <section id="live" aria-labelledby="live-title" className="bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <div className="max-w-2xl">
          <h2 id="live-title" className="text-3xl font-medium leading-tight tracking-[-0.02em] text-paper sm:text-5xl">The network, right now.</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
            These panels read the same API as the dashboard. Nothing on this page is typed in by hand.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-12">
          <div className={`${PANEL} lg:col-span-7`}>
            <h3 className="mb-5 text-lg font-medium text-paper">Congestion across the city</h3>
            <DataBoundary loading={live.loading} error={live.error} data={live.data} onRetry={live.refetch} height={260}
              isEmpty={(d) => d.roads.length === 0} emptyTitle="No traffic readings yet"
              emptyHint={<>Load the demo city with <code className="text-slate-300">python -m app.seed</code>, then reload.</>}>
              {(d) => <NetworkNow data={d} streaming={live.streaming} />}
            </DataBoundary>
          </div>

          <div className={`${PANEL} lg:col-span-5`}>
            <h3 className="mb-5 text-lg font-medium text-paper">How good is the forecast?</h3>
            <DataBoundary loading={model.loading} error={model.error} data={model.data} onRetry={model.refetch} height={260}
              isEmpty={(d) => !d.available || !d.info} emptyTitle="No forecasting model is loaded"
              emptyHint={<>Train one with <code className="text-slate-300">python -m app.ml.train</code>, then reload.</>}>
              {(d) => (d.info ? <ForecastEvidence info={d.info} /> : null)}
            </DataBoundary>
          </div>
        </div>
      </div>
    </section>
  );
}
