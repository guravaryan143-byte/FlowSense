import { RotateCcw, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { QueueChart } from "../charts/charts";
import { Button, Card, DataBoundary, Field, Input, PageHeader, Pill, RoleGate, Select, SimBanner, Table, Td, Th } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { useTrafficStream } from "../hooks/useTrafficStream";
import { errorMessage } from "../services/api";
import { getSignal, getSignals, optimizeSignal, resetSignal } from "../services/endpoints";
import type { OptimizeResult, Scenario, Signal } from "../types";
import { fmtDec, fmtInt, fmtPct, titleCase } from "../utils/format";

const SCENARIOS: { value: Scenario; label: string; hint: string }[] = [
  { value: "live", label: "Current traffic", hint: "Arrival rates taken from the city's current conditions" },
  { value: "balanced", label: "Balanced demand", hint: "Same flow on both streets" },
  { value: "ns_heavy", label: "North–south heavy", hint: "Main street busier than the cross street all hour" },
  { value: "shifting", label: "Shifting demand", hint: "Heavy north–south first half-hour, heavy east–west second half" },
];

function TimingBar({ label, ns, ew, cycle }: { label: string; ns: number; ew: number; cycle: number }) {
  const lost = Math.max(0, cycle - ns - ew);
  const w = (v: number) => `${(v / cycle) * 100}%`;
  return (
    <div className="space-y-1" role="img" aria-label={`${label}: north-south green ${ns} s, east-west green ${ew} s`}>
      <div className="flex justify-between text-xs text-slate-400"><span>{label}</span><span className="tabular-nums">NS {fmtDec(ns)} s · EW {fmtDec(ew)} s</span></div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink-900">
        <div className="bg-cyan-400" style={{ width: w(ns) }} /><div className="bg-blue-500" style={{ width: w(ew) }} /><div className="bg-slate-600" style={{ width: w(lost) }} title="Yellow / all-red" />
      </div>
    </div>
  );
}

function Results({ r }: { r: OptimizeResult }) {
  const rows: { label: string; fixed: number; adaptive: number; change: string; digits?: number }[] = [
    { label: "Average wait per vehicle (s)", fixed: r.fixed.avg_wait_s, adaptive: r.adaptive.avg_wait_s, change: fmtPct(r.improvement.wait_reduction_pct == null ? null : -r.improvement.wait_reduction_pct), digits: 1 },
    { label: "Vehicles served (throughput)", fixed: r.fixed.throughput, adaptive: r.adaptive.throughput, change: fmtPct(r.improvement.throughput_change_pct), digits: 0 },
    { label: "Average queue (vehicles)", fixed: r.fixed.avg_queue, adaptive: r.adaptive.avg_queue, change: fmtPct(r.improvement.queue_reduction_pct == null ? null : -r.improvement.queue_reduction_pct), digits: 1 },
    { label: "Longest queue (vehicles)", fixed: r.fixed.max_queue, adaptive: r.adaptive.max_queue, change: "—", digits: 0 },
    { label: "Queue left at the end", fixed: r.fixed.final_queue, adaptive: r.adaptive.final_queue, change: "—", digits: 0 },
  ];
  const good = (r.improvement.wait_reduction_pct ?? 0) >= 5;
  return (
    <div className="space-y-4" data-testid="optimize-results">
      <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${good ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-line bg-ink-800 text-slate-200"}`}>{r.improvement.verdict}</p>
      <Table>
        <thead><tr><Th>Measured in simulation</Th><Th className="text-right">Fixed-time</Th><Th className="text-right">Adaptive</Th><Th className="text-right">Change</Th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.label}><Td>{x.label}</Td><Td className="text-right tabular-nums">{x.digits ? fmtDec(x.fixed) : fmtInt(x.fixed)}</Td><Td className="text-right tabular-nums">{x.digits ? fmtDec(x.adaptive) : fmtInt(x.adaptive)}</Td><Td className="text-right tabular-nums">{x.change}</Td></tr>
        ))}</tbody>
      </Table>
      <QueueChart fixed={r.fixed.queue_series} adaptive={r.adaptive.queue_series} />
      <p className="text-xs leading-relaxed text-slate-500">{r.notice} {fmtInt(r.fixed.vehicles_arrived)} vehicles arrived in this {Math.round(r.duration_s / 60)}-minute run (seed {r.seed}); both strategies saw exactly the same arrivals.</p>
    </div>
  );
}

export default function Signals() {
  const { hasRole } = useAuth();
  const stream = useTrafficStream();
  const signals = useAsync(getSignals, [], { intervalMs: 10000 });
  const [selected, setSelected] = useState<number | null>(null);
  const [scenario, setScenario] = useState<Scenario>("shifting");
  const [duration, setDuration] = useState("3600");
  const [seed, setSeed] = useState("42");
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  useEffect(() => { if (selected === null && signals.data?.length) setSelected(signals.data[0].intersection_id); }, [signals.data, selected]);
  const detail = useAsync(() => getSignal(selected as number), [selected], { enabled: selected !== null });
  useEffect(() => { setResult(null); setError(null); }, [selected]);

  const run = async () => {
    if (selected === null) return;
    setBusy(true); setError(null);
    try {
      setResult(await optimizeSignal({ intersection_id: selected, scenario, duration_s: Number(duration), seed: Number(seed) || 0, apply: apply && hasRole("operator") }));
      detail.refetch(); signals.refetch();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (selected === null) return;
    setBusy(true); setError(null);
    try { await resetSignal(selected); detail.refetch(); signals.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const phaseOf = (s: Signal) => stream.signals[s.intersection_id]?.current_phase ?? s.current_phase;

  return (
    <>
      <PageHeader title="Signal optimization" description="Compare fixed-time signals with a transparent adaptive rule that gives more green to the busier street, always within configured limits." />
      <SimBanner />
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <Card title="Intersections" padded={false} className="lg:max-h-[780px] lg:overflow-y-auto">
          <DataBoundary loading={signals.loading} error={signals.error} data={signals.data} onRetry={signals.refetch}>
            {(list) => (
              <ul>
                {list.map((s) => (
                  <li key={s.intersection_id}>
                    <button onClick={() => setSelected(s.intersection_id)} aria-pressed={s.intersection_id === selected}
                      className={`flex w-full items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 text-left text-sm hover:bg-ink-800 ${s.intersection_id === selected ? "bg-ink-800" : ""}`}>
                      <span className="min-w-0"><span className="block truncate text-slate-100">{s.intersection_name}</span><span className="text-xs text-slate-500">queue ≈ {fmtInt(s.total_estimated_queue)} veh</span></span>
                      <span className="flex flex-col items-end gap-1"><Pill tone={s.mode === "adaptive" ? "cyan" : "neutral"}>{s.mode}</Pill><Pill tone="green">{phaseOf(s)} green</Pill></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DataBoundary>
        </Card>

        <div className="space-y-4 lg:col-span-2 xl:col-span-3">
          <Card title={detail.data?.intersection_name ?? "Select an intersection"} subtitle="NS = north–south green · EW = east–west green · grey = yellow / all-red"
                actions={detail.data && <Pill tone={detail.data.mode === "adaptive" ? "cyan" : "neutral"}>{detail.data.mode}</Pill>}>
            <DataBoundary loading={detail.loading && selected !== null} error={detail.error} data={detail.data} onRetry={detail.refetch}>
              {(d) => (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <TimingBar label="Fixed-time plan" ns={d.fixed_baseline.ns_green_s} ew={d.fixed_baseline.ew_green_s} cycle={d.fixed_baseline.cycle_s} />
                    <TimingBar label="Currently running" ns={d.current.ns_green_s} ew={d.current.ew_green_s} cycle={d.current.cycle_s} />
                    <TimingBar label="Recommended now (adaptive)" ns={d.recommended.ns_green_s} ew={d.recommended.ew_green_s} cycle={d.recommended.cycle_s} />
                    <p className="text-xs text-slate-500">Pressure (estimated queued vehicles): NS {fmtDec(d.pressure.NS)} · EW {fmtDec(d.pressure.EW)}</p>
                  </div>
                  <Table>
                    <thead><tr><Th>Approach</Th><Th>Phase</Th><Th className="text-right">Vehicles</Th><Th className="text-right">Queue ≈</Th></tr></thead>
                    <tbody>{d.approaches.map((a) => (
                      <tr key={a.road_id}><Td>{a.road_name}{a.is_closed && <Pill tone="red"> closed</Pill>}</Td><Td>{a.phase}</Td><Td className="text-right tabular-nums">{fmtInt(a.vehicle_count)}</Td><Td className="text-right tabular-nums">{fmtDec(a.estimated_queue)}</Td></tr>
                    ))}</tbody>
                  </Table>
                </div>
              )}
            </DataBoundary>
          </Card>

          <Card title="Compare fixed-time and adaptive control" subtitle="Both strategies are run on identical simulated traffic, so the comparison is fair.">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Traffic scenario" htmlFor="scenario" hint={SCENARIOS.find((s) => s.value === scenario)?.hint}>
                <Select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>{SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
              </Field>
              <Field label="Simulated duration" htmlFor="duration"><Select id="duration" value={duration} onChange={(e) => setDuration(e.target.value)}><option value="900">15 minutes</option><option value="1800">30 minutes</option><option value="3600">1 hour</option><option value="7200">2 hours</option></Select></Field>
              <Field label="Random seed" htmlFor="seed" hint="Same seed = same vehicles"><Input id="seed" type="number" min={0} value={seed} onChange={(e) => setSeed(e.target.value)} /></Field>
              <div className="flex flex-col justify-end gap-2">
                <label className={`flex items-center gap-2 text-sm ${hasRole("operator") ? "text-slate-200" : "text-slate-500"}`}>
                  <input type="checkbox" checked={apply} disabled={!hasRole("operator")} onChange={(e) => setApply(e.target.checked)} /> Apply recommended timing {!hasRole("operator") && <span className="text-xs">(operators only)</span>}
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <RoleGate min="viewer" action="run a signal comparison"><Button onClick={run} loading={busy} disabled={selected === null}><Zap className="h-4 w-4" />Run comparison</Button></RoleGate>
              {hasRole("operator") && detail.data?.mode === "adaptive" && <Button variant="secondary" onClick={reset} disabled={busy}><RotateCcw className="h-4 w-4" />Revert to fixed-time</Button>}
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
            {result && <div className="mt-5 border-t border-line pt-4"><h3 className="mb-3 text-sm font-semibold text-slate-100">Result · {titleCase(result.scenario)}{result.applied && <span className="ml-2"><Pill tone="cyan">timing applied</Pill></span>}</h3><Results r={result} /></div>}
          </Card>
        </div>
      </div>
    </>
  );
}
