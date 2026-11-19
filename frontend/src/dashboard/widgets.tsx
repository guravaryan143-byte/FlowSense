import { Link } from "react-router-dom";
import { EmptyState, LevelBadge, Pill } from "../components/ui";
import type { EmergencyBrief, Incident, PredictionOverview, RoadTraffic, SignalBrief } from "../types";
import { SEVERITY_COLOR, levelRank } from "../utils/congestion";
import { fmtDateTime, fmtDistance, fmtDuration, fmtInt, fmtPct, titleCase } from "../utils/format";

const sevTone = { low: "neutral", medium: "amber", high: "amber", critical: "red" } as const;

export function IncidentFeed({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) return <EmptyState title="No active incidents" hint="Reported incidents appear here until they are resolved." />;
  return (
    <ul className="divide-y divide-line/70">
      {incidents.map((i) => (
        <li key={i.id} className="flex items-start gap-3 py-2.5">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[i.severity] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-100">{titleCase(i.incident_type)}</span>
              <Pill tone={sevTone[i.severity]}>{i.severity}</Pill>
              {i.closes_road && <Pill tone="red">road closed</Pill>}
            </div>
            <p className="truncate text-xs text-slate-400">{i.road_name ?? "Off-network"} · {fmtDateTime(i.created_at)} · {titleCase(i.status)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PredictionSummary({ data }: { data: PredictionOverview }) {
  if (!data.model_available) {
    return <EmptyState title="Prediction model not trained yet" hint={<>Run <code className="text-slate-300">python -m app.ml.train</code> in the backend folder to enable forecasts.</>} />;
  }
  const worsening = data.predictions.filter((p) => p.congestion_level !== p.current_level)
    .sort((a, b) => levelRank(b.congestion_level) - levelRank(a.congestion_level)).slice(0, 3);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Forecast for the next <b>{data.horizon_minutes} min</b>:{" "}
        <b className={data.summary.predicted_congested_roads ? "text-amber-300" : "text-emerald-300"}>{data.summary.predicted_congested_roads ?? 0}</b> of {data.predictions.length} roads expected to be heavy or severe.
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {(["free_flow", "moderate", "heavy", "severe"] as const).map((l) => (
          <div key={l} className="rounded-lg bg-ink-900 px-2 py-2"><div className="text-lg font-semibold tabular-nums text-slate-50">{data.summary[l] ?? 0}</div><LevelBadge level={l} /></div>
        ))}
      </div>
      {worsening.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-400">
          {worsening.map((p) => <li key={p.road_id} className="flex items-center justify-between gap-2"><span className="truncate">{p.road_name}</span><span className="flex items-center gap-1.5 whitespace-nowrap"><LevelBadge level={p.current_level} />→<LevelBadge level={p.congestion_level} /></span></li>)}
        </ul>
      )}
      <Link to="/predictions" className="inline-block text-xs text-accent hover:underline">All predictions →</Link>
    </div>
  );
}

export function RoutingSummary({ data }: { data: EmergencyBrief }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-xs text-slate-400">Active routes</dt><dd className="text-xl font-semibold tabular-nums text-slate-50">{data.active_routes}</dd></div>
      <div><dt className="text-xs text-slate-400">Average ETA</dt><dd className="text-xl font-semibold tabular-nums text-slate-50">{fmtDuration(data.average_eta_s)}</dd></div>
      <div className="col-span-2 text-xs text-slate-400">
        {data.last_route ? <>Latest: {titleCase(data.last_route.vehicle_type)} · {fmtDistance(data.last_route.distance_m)} · {fmtDuration(data.last_route.estimated_time_s)} · {titleCase(data.last_route.status)}</> : "No emergency routes planned yet."}
        {" "}<Link to="/emergency" className="text-accent hover:underline">Plan a route →</Link>
      </div>
    </dl>
  );
}

export function SignalSummary({ data }: { data: SignalBrief }) {
  if (data.runs === 0) return <EmptyState title="No optimisation runs yet" hint={<>Run a comparison on the <Link to="/signals" className="text-accent hover:underline">Signal Optimization</Link> page.</>} />;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-50">{fmtPct(data.average_wait_reduction_pct == null ? null : -data.average_wait_reduction_pct)}</span>
        <span className="text-xs text-slate-400">average waiting time, adaptive vs fixed, over {data.runs} simulated run{data.runs > 1 ? "s" : ""}</span>
      </div>
      {data.last_run && <p className="text-xs text-slate-300">Latest ({titleCase(data.last_run.scenario)}): {data.last_run.improvement.verdict}</p>}
      <p className="text-xs text-slate-500">{data.note}</p>
    </div>
  );
}

export function ActivityList({ roads }: { roads: RoadTraffic[] }) {
  const busiest = [...roads].filter((r) => !r.is_closed).sort((a, b) => b.occupancy - a.occupancy).slice(0, 6);
  return (
    <ul className="divide-y divide-line/70">
      {busiest.map((r) => (
        <li key={r.road_id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0"><div className="truncate text-slate-100">{r.road_name}</div><div className="text-xs text-slate-500">{fmtInt(r.vehicle_count)} vehicles · {r.average_speed.toFixed(0)} km/h</div></div>
          <LevelBadge level={r.congestion_level} />
        </li>
      ))}
      {roads.filter((r) => r.is_closed).map((r) => (
        <li key={r.road_id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate text-slate-300">{r.road_name}</span><LevelBadge level="closed" /></li>
      ))}
    </ul>
  );
}
