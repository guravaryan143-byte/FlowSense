import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { HistoryChart } from "../charts/charts";
import { Card, DataBoundary, Input, KpiCard, LevelBadge, PageHeader, Select, SimBanner, Table, Td, Th } from "../components/ui";
import { SimulationControls } from "../components/SimulationControls";
import { useAsync } from "../hooks/useAsync";
import { useLiveTraffic } from "../hooks/useLiveTraffic";
import { LayerToggles, MapLegend, TrafficMap, type LayerKey } from "../maps/TrafficMap";
import { getIncidents, getIntersections, getRoadHistory, getRoads } from "../services/endpoints";
import type { RoadTraffic } from "../types";
import { LEVEL_LABEL, LEVEL_ORDER, levelRank } from "../utils/congestion";
import { fmtDateTime, fmtDec, fmtInt, fmtPct } from "../utils/format";

export default function TrafficMonitoring() {
  const live = useLiveTraffic();
  const roads = useAsync(getRoads, []);
  const intersections = useAsync(getIntersections, []);
  const incidents = useAsync(() => getIncidents({ active_only: true, limit: 50 }), [], { intervalMs: 20000 });
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [layers, setLayers] = useState<Partial<Record<LayerKey, boolean>>>({});
  const history = useAsync(() => getRoadHistory(selected as number, 24), [selected], { enabled: selected !== null });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (live.data?.roads ?? [])
      .filter((r) => (level === "all" || r.congestion_level === level) && (!q || r.road_name.toLowerCase().includes(q)))
      .sort((a, b) => levelRank(b.congestion_level) - levelRank(a.congestion_level) || b.occupancy - a.occupancy);
  }, [live.data, query, level]);
  const trafficById = useMemo(() => Object.fromEntries((live.data?.roads ?? []).map((r) => [r.road_id, r])) as Record<number, RoadTraffic>, [live.data]);
  const current = selected !== null ? trafficById[selected] : undefined;
  const road = roads.data?.find((r) => r.id === selected);

  return (
    <>
      <PageHeader title="Live traffic monitoring" description="Every road in the network with its current vehicle count, speed, density and congestion level." />
      <SimBanner asOf={live.data?.summary.as_of ? fmtDateTime(live.data.summary.as_of) : null} />

      <Card className="mb-4" title="Simulation"><SimulationControls /></Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Network map" actions={<LayerToggles value={layers} onChange={setLayers} available={["roads", "intersections", "incidents"]} />}>
          <DataBoundary loading={roads.loading} error={roads.error} data={roads.data} onRetry={roads.refetch} height={420}>
            {(r) => (
              <div className="space-y-3">
                <TrafficMap roads={r} intersections={intersections.data ?? []} traffic={trafficById} incidents={incidents.data?.items ?? []} selectedRoadId={selected} onSelectRoad={setSelected} layers={layers} height={460} />
                <MapLegend items={["traffic", "incident"]} />
              </div>
            )}
          </DataBoundary>
        </Card>

        <Card className="xl:col-span-2" title={road ? road.road_name : "Road details"} subtitle={road ? `${road.road_type} · ${road.lanes} lane(s) · limit ${road.speed_limit_kmh} km/h · ${Math.round(road.length_m)} m` : "Select a road on the map or in the table"}>
          {!current ? (
            <p className="py-10 text-center text-sm text-slate-500">No road selected.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><LevelBadge level={current.congestion_level} /><span className="text-xs text-slate-500">{fmtDateTime(current.recorded_at)}</span></div>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label="Vehicles" value={fmtInt(current.vehicle_count)} hint={road ? `capacity ${road.capacity}` : undefined} />
                <KpiCard label="Avg speed" value={fmtDec(current.average_speed)} unit="km/h" />
                <KpiCard label="Density" value={fmtDec(current.density)} unit="veh/km/lane" />
                <KpiCard label="Occupancy" value={fmtPct(current.occupancy * 100, false)} hint="vehicles ÷ jam capacity" />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Last 24 hours</h3>
                <DataBoundary loading={history.loading} error={history.error} data={history.data} onRetry={history.refetch} isEmpty={(d) => d.items.length === 0} emptyTitle="No history for this road">
                  {(d) => <HistoryChart points={d.items} />}
                </DataBoundary>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="All roads" padded={false}
            actions={<div className="flex items-center gap-2">
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-500" /><Input aria-label="Search roads" placeholder="Search roads" className="w-44 pl-8" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
              <Select aria-label="Filter by congestion level" className="w-36" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="all">All levels</option>{LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </Select>
            </div>}>
        <DataBoundary loading={live.loading} error={live.error} data={live.data} onRetry={live.refetch}>
          {() => rows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No roads match your filters.</p> : (
            <Table>
              <thead><tr><Th>Road</Th><Th>Level</Th><Th className="text-right">Vehicles</Th><Th className="text-right">Speed (km/h)</Th><Th className="text-right">Density</Th><Th className="text-right">Occupancy</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.road_id} onClick={() => setSelected(r.road_id)} className={`cursor-pointer hover:bg-ink-800 ${r.road_id === selected ? "bg-ink-800" : ""}`} aria-selected={r.road_id === selected}>
                    <Td><button className="text-left hover:text-accent" onClick={() => setSelected(r.road_id)}>{r.road_name}</button></Td>
                    <Td><LevelBadge level={r.congestion_level} /></Td>
                    <Td className="text-right tabular-nums">{fmtInt(r.vehicle_count)}</Td>
                    <Td className="text-right tabular-nums">{fmtDec(r.average_speed)}</Td>
                    <Td className="text-right tabular-nums">{fmtDec(r.density)}</Td>
                    <Td className="text-right tabular-nums">{fmtPct(r.occupancy * 100, false)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </DataBoundary>
      </Card>
    </>
  );
}
