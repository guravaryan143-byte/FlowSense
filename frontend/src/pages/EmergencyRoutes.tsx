import { RefreshCw, Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, DataBoundary, Field, LevelBadge, PageHeader, Pill, RoleGate, Select, SimBanner, Table, Td, Th } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useLiveTraffic } from "../hooks/useLiveTraffic";
import { LayerToggles, MapLegend, TrafficMap, type LatLng, type LayerKey } from "../maps/TrafficMap";
import { errorMessage } from "../services/api";
import { getIntersections, getRoads, getRoutes, getVehicles, planRoute, recalcRoute } from "../services/endpoints";
import type { EmergencyRoute, RouteRequest, RoadTraffic } from "../types";
import { fmtDateTime, fmtDistance, fmtDuration, fmtInt, titleCase } from "../utils/format";

const statusTone = { active: "green", rerouted: "amber", cancelled: "red", completed: "neutral" } as const;

function RouteDetails({ r }: { r: EmergencyRoute }) {
  const route = r.route, alt = r.alternative, cmp = r.comparison;
  if (!route) return <p className="text-sm text-red-300">{r.note ?? "This route has no open path."}</p>;
  return (
    <div className="space-y-4" data-testid="route-details">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-ink-900 p-3"><div className="text-xs text-slate-400">Estimated travel time</div><div className="text-xl font-semibold tabular-nums text-accent">{fmtDuration(route.time_s)}</div></div>
        <div className="rounded-lg bg-ink-900 p-3"><div className="text-xs text-slate-400">Distance</div><div className="text-xl font-semibold tabular-nums text-slate-50">{fmtDistance(route.distance_m)}</div></div>
        <div className="rounded-lg bg-ink-900 p-3"><div className="text-xs text-slate-400">Search effort</div><div className="text-xl font-semibold tabular-nums text-slate-50">{route.nodes_expanded}</div><div className="text-[11px] text-slate-500">nodes expanded ({route.algorithm === "astar" ? "A*" : "Dijkstra"})</div></div>
      </div>
      {r.note && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{r.note}</p>}
      {cmp && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Fastest vs shortest</h3>
          <Table>
            <thead><tr><Th>Objective</Th><Th className="text-right">Travel time</Th><Th className="text-right">Distance</Th></tr></thead>
            <tbody>
              <tr><Td>Fastest (minimum travel time, traffic-adjusted)</Td><Td className="text-right tabular-nums">{fmtDuration(cmp.fastest_time_s)}</Td><Td className="text-right tabular-nums">{fmtDistance(cmp.fastest_distance_m)}</Td></tr>
              <tr><Td>Shortest (minimum distance, ignores traffic)</Td><Td className="text-right tabular-nums">{fmtDuration(cmp.shortest_time_s)}</Td><Td className="text-right tabular-nums">{fmtDistance(cmp.shortest_distance_m)}</Td></tr>
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-slate-400">{cmp.same_route ? "Both objectives choose the same road sequence." : `The fastest route saves ${fmtDuration(cmp.time_saved_by_fastest_s)} compared with the shortest one.`}</p>
        </div>
      )}
      {alt && <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">Alternative route (dashed on the map): {fmtDistance(alt.distance_m)}, {fmtDuration(alt.time_s)} ({alt.time_s >= route.time_s ? "+" : ""}{fmtDuration(Math.abs(alt.time_s - route.time_s))} vs recommended).</p>}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Road by road</h3>
        <ol className="space-y-1.5 text-sm">
          <li className="text-slate-300">Start at <b>{route.nodes[0].name}</b></li>
          {route.roads.map((rd, i) => (
            <li key={`${rd.id}-${i}`} className="flex items-center justify-between gap-3 border-l-2 border-accent/40 pl-3">
              <span className="min-w-0 truncate text-slate-200">{rd.name} <span className="text-slate-500">→ {route.nodes[i + 1].name}</span></span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">{fmtDistance(rd.length_m)} · {fmtDuration(rd.time_s)} <LevelBadge level={rd.congestion_level} /></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function EmergencyRoutes() {
  const roads = useAsync(getRoads, []);
  const intersections = useAsync(getIntersections, []);
  const vehicles = useAsync(getVehicles, []);
  const recent = useAsync(() => getRoutes(8), [], { intervalMs: 20000 });
  const live = useLiveTraffic();
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleType, setVehicleType] = useState<"ambulance" | "fire_service">("ambulance");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [algorithm, setAlgorithm] = useState<"astar" | "dijkstra">("astar");
  const [objective, setObjective] = useState<"fastest" | "shortest">("fastest");
  const [alternative, setAlternative] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<EmergencyRoute | null>(null);
  const [layers, setLayers] = useState<Partial<Record<LayerKey, boolean>>>({ intersections: true });

  const trafficById = useMemo(() => Object.fromEntries((live.data?.roads ?? []).map((r) => [r.road_id, r])) as Record<number, RoadTraffic>, [live.data]);
  const chosen = vehicles.data?.find((v) => String(v.id) === vehicleId);
  const nodeName = (id: number) => intersections.data?.find((n) => n.id === id)?.name ?? `#${id}`;
  const canSubmit = destination !== "" && (vehicleId !== "" || origin !== "") && !busy;

  const submit = async () => {
    setBusy(true); setError(null);
    const base = { destination_intersection_id: Number(destination), algorithm, objective, include_alternative: alternative };
    const req: RouteRequest = vehicleId ? { ...base, vehicle_id: Number(vehicleId) } : { ...base, vehicle_type: vehicleType, origin_intersection_id: Number(origin) };
    try { setActive(await planRoute(req)); recent.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const recalc = async (id: number) => {
    setBusy(true); setError(null);
    try { const res = await recalcRoute(id); setActive(res.route); recent.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Emergency route planner" description="Fastest and shortest routes for ambulances and fire engines on the traffic-weighted road graph. Closed roads are avoided and routes are re-planned automatically when a road closes." />
      <SimBanner />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Card title="Plan a route">
            <RoleGate min="operator" action="plan emergency routes">
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                <Field label="Emergency unit" htmlFor="vehicle" hint={chosen ? `${titleCase(chosen.vehicle_type)} · currently at ${nodeName(chosen.current_intersection_id)}` : "Pick a unit, or choose a vehicle type and start point below"}>
                  <Select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">— none (choose manually) —</option>
                    {(vehicles.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.unit_name} ({titleCase(v.vehicle_type)})</option>)}
                  </Select>
                </Field>
                {!vehicleId && (<>
                  <Field label="Vehicle type" htmlFor="vtype" hint={vehicleType === "fire_service" ? "Fire engines avoid narrow local streets" : undefined}>
                    <Select id="vtype" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as typeof vehicleType)}><option value="ambulance">Ambulance</option><option value="fire_service">Fire service</option></Select>
                  </Field>
                  <Field label="Start" htmlFor="origin">
                    <Select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">Select intersection…</option>{(intersections.data ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>
                  </Field>
                </>)}
                <Field label="Destination" htmlFor="destination">
                  <Select id="destination" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Select intersection…</option>{(intersections.data ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Objective" htmlFor="objective"><Select id="objective" value={objective} onChange={(e) => setObjective(e.target.value as typeof objective)}><option value="fastest">Fastest (time)</option><option value="shortest">Shortest (distance)</option></Select></Field>
                  <Field label="Algorithm" htmlFor="algorithm"><Select id="algorithm" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as typeof algorithm)}><option value="astar">A*</option><option value="dijkstra">Dijkstra</option></Select></Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={alternative} onChange={(e) => setAlternative(e.target.checked)} />Also find an alternative route</label>
                <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full"><RouteIcon className="h-4 w-4" />Plan route</Button>
              </form>
            </RoleGate>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          </Card>

          <Card title="Recent routes" padded={false}>
            <DataBoundary loading={recent.loading} error={recent.error} data={recent.data} onRetry={recent.refetch} isEmpty={(d) => d.length === 0} emptyTitle="No routes planned yet">
              {(list) => (
                <ul>
                  {list.map((r) => (
                    <li key={r.id} className={`border-b border-line/60 px-4 py-2.5 ${active?.id === r.id ? "bg-ink-800" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <button className="min-w-0 text-left text-sm text-slate-100 hover:text-accent" onClick={() => setActive(r)}>
                          <span className="block truncate">{nodeName(r.origin_intersection_id)} → {nodeName(r.destination_intersection_id)}</span>
                          <span className="text-xs text-slate-500">{titleCase(r.vehicle_type)} · {r.route ? `${fmtDuration(r.route.time_s)} · ${fmtDistance(r.route.distance_m)}` : "no open path"} · {fmtDateTime(r.created_at)}</span>
                        </button>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Pill tone={statusTone[r.status as keyof typeof statusTone] ?? "neutral"}>{r.status}{r.reroute_count > 0 ? ` ×${r.reroute_count}` : ""}</Pill>
                          <RoleGate min="operator" action="recalculate"><button className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50" disabled={busy} onClick={() => void recalc(r.id)}><RefreshCw className="h-3 w-3" />Recalculate</button></RoleGate>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DataBoundary>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <Card title="Route map" actions={<LayerToggles value={layers} onChange={setLayers} available={["intersections", "routes"]} />}>
            <DataBoundary loading={roads.loading} error={roads.error} data={roads.data} onRetry={roads.refetch} height={420}>
              {(r) => (
                <div className="space-y-3">
                  <TrafficMap roads={r} intersections={intersections.data ?? []} traffic={trafficById} layers={layers} height={440}
                    route={active?.route ? { primary: active.route.geometry as LatLng[], alternative: active.alternative?.geometry as LatLng[] | undefined, originId: active.origin_intersection_id, destinationId: active.destination_intersection_id } : undefined} />
                  <MapLegend items={["traffic", "route"]} />
                </div>
              )}
            </DataBoundary>
          </Card>
          <Card title={active ? `Route #${active.id} · ${titleCase(active.vehicle_type)}` : "Route details"} actions={active && <Pill tone={statusTone[active.status as keyof typeof statusTone] ?? "neutral"}>{active.status}</Pill>}
                subtitle={active ? `${nodeName(active.origin_intersection_id)} → ${nodeName(active.destination_intersection_id)} · ${fmtInt(active.reroute_count)} reroute(s)` : "Plan a route to see details here."}>
            {active ? <RouteDetails r={active} /> : <p className="py-6 text-center text-sm text-slate-500">No route selected.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
