import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { BarsChart, CompareBarsChart } from "../charts/charts";
import { Button, Card, DataBoundary, EmptyState, LevelBadge, PageHeader, Pill, RoleGate, SimBanner, Table, Td, Th } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { errorMessage } from "../services/api";
import { getModelInfo, getPredictionOverview, getRoadPrediction, runPredictions } from "../services/endpoints";
import type { ModelInfo, Prediction } from "../types";
import { fmtDateTime, fmtDec, fmtInt, titleCase } from "../utils/format";

const MODEL_NAMES: Record<string, string> = { random_forest: "Random Forest", baseline_persistence: "Baseline: no change", baseline_historical_mean: "Baseline: historical average" };

function Trend({ p }: { p: Prediction }) {
  const d = p.predicted_density - p.current_density;
  if (Math.abs(d) < 1) return <span className="inline-flex items-center gap-1 text-slate-400"><ArrowRight className="h-3.5 w-3.5" />stable</span>;
  return d > 0
    ? <span className="inline-flex items-center gap-1 text-amber-300"><ArrowUpRight className="h-3.5 w-3.5" />+{fmtDec(d)}</span>
    : <span className="inline-flex items-center gap-1 text-emerald-300"><ArrowDownRight className="h-3.5 w-3.5" />{fmtDec(d)}</span>;
}

function ModelCard({ info }: { info: ModelInfo }) {
  const order = ["random_forest", "baseline_persistence", "baseline_historical_mean"].filter((k) => info.metrics[k]);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        {[["Model version", info.version], ["Trained", fmtDateTime(info.trained_at)], ["Forecast horizon", `${info.horizon_minutes} min`], ["Training data", `${titleCase(info.data_source)} (${fmtInt(info.n_train)} train / ${fmtInt(info.n_test)} test rows)`],
          ["Test period starts", fmtDateTime(info.split_time)], ["Trees", String(info.n_estimators)]].map(([k, v]) => (
          <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="text-slate-100">{v}</dd></div>
        ))}
      </dl>
      <Table>
        <thead><tr><Th>Model (test set)</Th><Th className="text-right">Density MAE</Th><Th className="text-right">RMSE</Th><Th className="text-right">R²</Th><Th className="text-right">Speed MAE</Th><Th className="text-right">RMSE</Th><Th className="text-right">R²</Th></tr></thead>
        <tbody>
          {order.map((k) => {
            const m = info.metrics[k];
            return (
              <tr key={k} className={k === "random_forest" ? "bg-accent/5" : ""}>
                <Td className={k === "random_forest" ? "font-semibold text-accent" : ""}>{MODEL_NAMES[k] ?? k}</Td>
                {[m.target_density.mae, m.target_density.rmse, m.target_density.r2, m.target_speed.mae, m.target_speed.rmse, m.target_speed.r2].map((v, i) => <Td key={i} className="text-right tabular-nums">{v.toFixed(3)}</Td>)}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs leading-relaxed text-slate-400">
        Density in vehicles/km/lane, speed in km/h; lower MAE/RMSE is better, R² closer to 1 is better. The split is chronological (the last 20 % of time is the test set).
        {info.density_mae_improvement_vs_persistence_pct != null && <> Density MAE is <b className="text-slate-200">{fmtDec(info.density_mae_improvement_vs_persistence_pct)}%</b> lower than the "no change" baseline.</>}
        {" "}<b className="text-amber-300">Caveat:</b> the data is simulated with a smooth daily demand curve, so these scores show the pipeline works and beats naive baselines here. They are not a claim about real-world accuracy.
      </p>
    </div>
  );
}

export default function Predictions() {
  const overview = useAsync(getPredictionOverview, [], { intervalMs: 30000 });
  const info = useAsync(getModelInfo, []);
  const [selected, setSelected] = useState<number | null>(null);
  const detail = useAsync(() => getRoadPrediction(selected as number), [selected], { enabled: selected !== null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const sorted = useMemo(() => [...(overview.data?.predictions ?? [])].sort((a, b) => b.predicted_density - a.predicted_density), [overview.data]);
  const chartData = sorted.slice(0, 12).map((p) => ({ label: p.road_name.replace(/ \((\w+) Section\)/, " ($1)"), now: p.current_density, forecast: p.predicted_density }));

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const saved = await runPredictions(undefined, true);
      setMessage({ ok: true, text: `Saved ${saved.length} predictions to the database.` });
      overview.refetch(); detail.refetch();
    } catch (e) { setMessage({ ok: false, text: errorMessage(e) }); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="AI congestion predictions" description="A Random Forest model forecasts each road's density and speed, trained on simulated history."
        actions={<RoleGate min="viewer" action="save a prediction run"><Button onClick={save} loading={saving} disabled={!overview.data?.model_available}><Sparkles className="h-4 w-4" />Run &amp; save predictions</Button></RoleGate>} />
      <SimBanner />
      {message && <p role={message.ok ? "status" : "alert"} className={`mb-4 rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>{message.text}</p>}

      <DataBoundary loading={overview.loading} error={overview.error} data={overview.data} onRetry={overview.refetch}>
        {(o) => !o.model_available ? (
          <Card><EmptyState title="The prediction model has not been trained yet" hint={<>{o.message} After training, reload this page.</>} /></Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2" title={`Forecast for the next ${o.horizon_minutes} minutes`} subtitle="Busiest roads: current vs predicted density (vehicles/km/lane)">
                <CompareBarsChart data={chartData} />
              </Card>
              <Card title="Predicted congestion">
                <div className="space-y-2">
                  {(["free_flow", "moderate", "heavy", "severe"] as const).map((l) => (
                    <div key={l} className="flex items-center justify-between"><LevelBadge level={l} /><span className="text-xl font-semibold tabular-nums text-slate-50">{o.summary[l] ?? 0}</span></div>
                  ))}
                </div>
              </Card>
            </div>

            <Card title="All roads" subtitle="Click a row to see saved predictions for that road" padded={false}>
              <Table>
                <thead><tr><Th>Road</Th><Th>Now</Th><Th className="text-right">Density now</Th><Th>Forecast</Th><Th className="text-right">Density forecast</Th><Th>Change</Th><Th className="text-right">Speed now → forecast</Th></tr></thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.road_id} onClick={() => setSelected(p.road_id)} className={`cursor-pointer hover:bg-ink-800 ${p.road_id === selected ? "bg-ink-800" : ""}`}>
                      <Td>{p.road_name}</Td><Td><LevelBadge level={p.current_level} /></Td><Td className="text-right tabular-nums">{fmtDec(p.current_density)}</Td>
                      <Td><LevelBadge level={p.congestion_level} /></Td><Td className="text-right tabular-nums">{fmtDec(p.predicted_density)}</Td><Td><Trend p={p} /></Td>
                      <Td className="text-right tabular-nums">{fmtDec(p.current_speed)} → {fmtDec(p.predicted_speed)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            {selected !== null && (
              <Card title={`Saved predictions: ${sorted.find((p) => p.road_id === selected)?.road_name ?? `road ${selected}`}`}>
                <DataBoundary loading={detail.loading} error={detail.error} data={detail.data} onRetry={detail.refetch} isEmpty={(d) => d.history.length === 0} emptyTitle="No saved predictions for this road" emptyHint='Use "Run & save predictions" to store the current forecast.'>
                  {(d) => (
                    <Table>
                      <thead><tr><Th>Made at</Th><Th>For time</Th><Th>Level</Th><Th className="text-right">Density</Th><Th className="text-right">Speed</Th><Th>Model</Th></tr></thead>
                      <tbody>{d.history.slice(0, 10).map((h) => (
                        <tr key={h.id}><Td>{fmtDateTime(h.predicted_at)}</Td><Td>{fmtDateTime(h.target_time)}</Td><Td><LevelBadge level={h.congestion_level} /></Td><Td className="text-right tabular-nums">{fmtDec(h.predicted_density)}</Td><Td className="text-right tabular-nums">{fmtDec(h.predicted_speed)}</Td><Td><Pill>{h.model_version}</Pill></Td></tr>
                      ))}</tbody>
                    </Table>
                  )}
                </DataBoundary>
              </Card>
            )}
          </div>
        )}
      </DataBoundary>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Model evaluation" subtitle="Measured on held-out, later-in-time data">
          <DataBoundary loading={info.loading} error={info.error} data={info.data} onRetry={info.refetch}>
            {(d) => d.available && d.info ? <ModelCard info={d.info} /> : <EmptyState title="No evaluation available" hint={d.message} />}
          </DataBoundary>
        </Card>
        <Card title="What drives the forecast?" subtitle="Feature importance">
          {info.data?.info ? <BarsChart horizontal height={300} label="Feature importance" data={Object.entries(info.data.info.feature_importances).slice(0, 8).map(([label, value]) => ({ label, value: Math.round(value * 1000) / 1000 }))} />
            : <EmptyState title="Train the model to see this" />}
        </Card>
      </div>
    </>
  );
}
