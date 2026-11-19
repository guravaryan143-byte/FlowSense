import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { BarsChart } from "../charts/charts";
import { Card, DataBoundary, Field, KpiCard, PageHeader, Select, SimBanner, Table, Td, Th } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { LayerToggles, MapLegend, TrafficMap, type LayerKey } from "../maps/TrafficMap";
import { getAccidentAnalytics, getAccidents, getHotspots, getIntersections, getRoads, type AccidentFilters } from "../services/endpoints";
import type { Severity } from "../types";
import { SEVERITIES, SEVERITY_COLOR } from "../utils/congestion";
import { fmtDec, fmtInt, titleCase } from "../utils/format";

const PERIODS = [{ id: "all", label: "All time" }, { id: "365", label: "Last 12 months" }, { id: "180", label: "Last 6 months" }, { id: "90", label: "Last 3 months" }, { id: "30", label: "Last 30 days" }];

export default function Accidents() {
  const [period, setPeriod] = useState("all");
  const [severity, setSeverity] = useState<"" | Severity>("");
  const [eps, setEps] = useState("150");
  const [minSamples, setMinSamples] = useState("8");
  const [layers, setLayers] = useState<Partial<Record<LayerKey, boolean>>>({ accidents: true, hotspots: true, intersections: false });

  // computed once per period change, not on every render, so the requests below do not loop
  const filters: AccidentFilters = useMemo(() => ({
    ...(period !== "all" ? { date_from: new Date(Date.now() - Number(period) * 86_400_000).toISOString() } : {}),
    ...(severity ? { severity } : {}),
  }), [period, severity]);

  const roads = useAsync(getRoads, []);
  const intersections = useAsync(getIntersections, []);
  const hotspots = useAsync(() => getHotspots(filters, Number(eps), Number(minSamples)), [filters, eps, minSamples]);
  const points = useAsync(() => getAccidents(filters, 1000), [filters]);
  const stats = useAsync(() => getAccidentAnalytics(filters), [filters]);

  return (
    <>
      <PageHeader title="Accident hotspot analysis" description="Where historical accidents are concentrated, found with DBSCAN clustering on accident coordinates." />
      <SimBanner />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200" role="note">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{hotspots.data?.disclaimer ?? "Hotspots show where accidents were concentrated in the past. They are not a prediction that an accident will happen there."} The accident records are simulated.</span>
      </div>

      <Card className="mb-4" title="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Time period" htmlFor="period"><Select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
          <Field label="Severity" htmlFor="severity"><Select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value as "" | Severity)}><option value="">All severities</option>{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
          <Field label="Cluster radius" htmlFor="eps" hint="Accidents closer than this are neighbours"><Select id="eps" value={eps} onChange={(e) => setEps(e.target.value)}>{[100, 150, 200, 300].map((v) => <option key={v} value={v}>{v} m</option>)}</Select></Field>
          <Field label="Minimum accidents per hotspot" htmlFor="minsamples"><Select id="minsamples" value={minSamples} onChange={(e) => setMinSamples(e.target.value)}>{[4, 6, 8, 12, 16].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
        </div>
      </Card>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Accident statistics">
        <KpiCard label="Accidents in selection" value={fmtInt(stats.data?.total)} />
        <KpiCard label="Hotspots found" value={fmtInt(hotspots.data?.hotspots.length)} tone="warn" />
        <KpiCard label="Inside hotspots" value={fmtInt(hotspots.data?.clustered_accidents)} hint="clustered accidents" />
        <KpiCard label="Isolated" value={fmtInt(hotspots.data?.noise_accidents)} hint="not part of any cluster" />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Hotspot map" actions={<LayerToggles value={layers} onChange={setLayers} available={["hotspots", "accidents", "intersections"]} />}>
          <DataBoundary loading={roads.loading} error={roads.error} data={roads.data} onRetry={roads.refetch} height={400}>
            {(r) => (
              <div className="space-y-3">
                <TrafficMap roads={r} intersections={intersections.data ?? []} hotspots={hotspots.data?.hotspots ?? []} accidents={points.data?.items ?? []} layers={layers} height={460} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <MapLegend items={["hotspot", "accident"]} />
                  {SEVERITIES.map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />{titleCase(s)}</span>)}
                </div>
              </div>
            )}
          </DataBoundary>
        </Card>
        <Card className="xl:col-span-2" title="Ranked hotspots" subtitle="Ranked by severity-weighted score (low 1 · medium 2 · high 4 · critical 8)" padded={false}>
          <DataBoundary loading={hotspots.loading} error={hotspots.error} data={hotspots.data} onRetry={hotspots.refetch} isEmpty={(d) => d.hotspots.length === 0} emptyTitle="No hotspots with these settings" emptyHint="Try a larger radius, fewer required accidents, or a longer period.">
            {(d) => (
              <Table>
                <thead><tr><Th>#</Th><Th>Nearest road</Th><Th className="text-right">Accidents</Th><Th className="text-right">Score</Th><Th className="text-right">Per month</Th></tr></thead>
                <tbody>{d.hotspots.map((h) => (
                  <tr key={h.rank}><Td className="font-semibold text-red-300">{h.rank}</Td>
                    <Td><div className="max-w-[200px] truncate">{h.nearest_road}</div><div className="text-xs text-slate-500">mostly {titleCase(h.top_accident_type)} · radius {Math.round(h.radius_m)} m</div></Td>
                    <Td className="text-right tabular-nums">{h.accident_count}</Td><Td className="text-right tabular-nums">{h.severity_score}</Td><Td className="text-right tabular-nums">{fmtDec(h.accidents_per_month)}</Td></tr>
                ))}</tbody>
              </Table>
            )}
          </DataBoundary>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By severity">
          <DataBoundary loading={stats.loading} error={stats.error} data={stats.data} onRetry={stats.refetch}>
            {(d) => <BarsChart label="Accidents by severity" data={SEVERITIES.map((s) => ({ label: titleCase(s), value: d.by_severity[s] ?? 0, color: SEVERITY_COLOR[s] }))} />}
          </DataBoundary>
        </Card>
        <Card title="By hour of day">
          <DataBoundary loading={stats.loading} error={stats.error} data={stats.data} onRetry={stats.refetch}>
            {(d) => <BarsChart label="Accidents by hour of day" data={d.by_hour.map((v, h) => ({ label: String(h), value: v }))} />}
          </DataBoundary>
        </Card>
        <Card title="By month">
          <DataBoundary loading={stats.loading} error={stats.error} data={stats.data} onRetry={stats.refetch} isEmpty={(d) => d.by_month.length === 0}>
            {(d) => <BarsChart label="Accidents by month" color="#3b82f6" data={d.by_month.map((m) => ({ label: String(m.month), value: Number(m.count) }))} />}
          </DataBoundary>
        </Card>
        <Card title="By accident type">
          <DataBoundary loading={stats.loading} error={stats.error} data={stats.data} onRetry={stats.refetch}>
            {(d) => <BarsChart horizontal label="Accidents by type" height={230} data={Object.entries(d.by_type).map(([k, v]) => ({ label: titleCase(k), value: v }))} />}
          </DataBoundary>
        </Card>
      </div>
    </>
  );
}
