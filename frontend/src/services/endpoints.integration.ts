/**
 * End-to-end check of the frontend's API layer against a REAL running backend.
 *   (backend running on :8000, freshly seeded, SEED_DEFAULT_PASSWORD known)
 *   VITE_API_URL=http://localhost:8000 VITE_DEMO_PASSWORD=... npm run test:integration
 * It uses the very same typed functions the pages use, so a contract mismatch fails here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { summarizeRoads } from "../utils/traffic";
import { API_BASE, errorMessage, tokenStore, wsUrl } from "./api";
import * as api from "./endpoints";

// minimal browser shims (this runs in Node)
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
  window: { dispatchEvent: () => true, location: { protocol: "http:", host: "localhost:8000" } },
});

const PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? "";
const signIn = async (role: string) => { const r = await api.login(`${role}@flowsense.demo`, PASSWORD); tokenStore.set(r.access_token); return r.user; };

beforeAll(() => { if (!API_BASE || !PASSWORD) throw new Error("Set VITE_API_URL and VITE_DEMO_PASSWORD to run the integration tests"); });

describe("frontend API layer against the real backend", () => {
  it("anonymous reads: health, network, live traffic, trends, overview", async () => {
    tokenStore.clear();
    expect(await api.getHealth()).toMatchObject({ status: "ok", database: "ok" });
    const [roads, nodes, live, trends, overview] = await Promise.all([api.getRoads(), api.getIntersections(), api.getLiveTraffic(), api.getTrends(24), api.getOverview()]);
    expect(roads).toHaveLength(28); expect(nodes).toHaveLength(16);
    expect(live.data_source).toBe("simulated"); expect(live.roads).toHaveLength(28);
    expect(trends.series.length).toBeGreaterThan(50);
    expect(overview.roads_total).toBe(28);
    // the frontend's own summary calculation must agree with the backend's, on real data
    expect(summarizeRoads(live.roads, live.summary.as_of)).toEqual(live.summary);
    const history = await api.getRoadHistory(5, 6);
    expect(history.total).toBe(24);
  });

  it("authentication and role enforcement", async () => {
    expect((await signIn("viewer")).role).toBe("viewer");
    expect((await api.fetchMe()).email).toBe("viewer@flowsense.demo");
    await expect(api.planRoute({ vehicle_type: "ambulance", origin_intersection_id: 1, destination_intersection_id: 15, algorithm: "astar", objective: "fastest", include_alternative: true }))
      .rejects.toSatisfy((e) => errorMessage(e).includes("operator"));
    await expect(api.login("viewer@flowsense.demo", "definitely-wrong")).rejects.toSatisfy((e) => /invalid email or password/i.test(errorMessage(e)));
    const fresh = `ts-${Date.now()}@example.com`;
    await api.register("Integration Tester", fresh, "a-long-password");
    expect((await api.login(fresh, "a-long-password")).user.role).toBe("viewer");
  });

  it("predictions, model info and a saved run", async () => {
    await signIn("viewer");
    const o = await api.getPredictionOverview();
    expect(o.model_available).toBe(true); expect(o.predictions).toHaveLength(28);
    const info = await api.getModelInfo();
    expect(info.info?.metrics.random_forest.target_density.r2).toBeGreaterThan(0);
    expect((await api.runPredictions([1, 2, 3], true)).map((p) => p.road_id)).toEqual([1, 2, 3]);
    expect((await api.getRoadPrediction(2)).history.length).toBeGreaterThan(0);
  });

  it("signals: list, detail, measured comparison; applying needs an operator", async () => {
    await signIn("viewer");
    const signals = await api.getSignals();
    expect(signals).toHaveLength(16);
    expect((await api.getSignal(7)).approaches.length).toBeGreaterThan(0);
    const r = await api.optimizeSignal({ intersection_id: 7, scenario: "ns_heavy", duration_s: 900, seed: 5, apply: false });
    expect(r.fixed.vehicles_arrived).toBe(r.adaptive.vehicles_arrived);
    expect(r.improvement.verdict.length).toBeGreaterThan(10);
    await expect(api.optimizeSignal({ intersection_id: 7, scenario: "ns_heavy", duration_s: 900, seed: 5, apply: true })).rejects.toSatisfy((e) => errorMessage(e).includes("operator"));
  });

  it("emergency routing, incident, road closure, automatic re-route, reopening", async () => {
    await signIn("operator");
    const vehicles = await api.getVehicles();
    expect(vehicles.length).toBeGreaterThan(0);
    const route = await api.planRoute({ vehicle_type: "ambulance", origin_intersection_id: 1, destination_intersection_id: 15, algorithm: "astar", objective: "fastest", include_alternative: true });
    expect(route.status).toBe("active");
    const victim = route.route!.roads[1].id;
    const incident = await api.createIncident({ road_id: victim, incident_type: "accident", severity: "high", description: "integration test" });
    const closed = await api.closeRoad(incident.id);
    expect(closed.rerouted_route_ids).toContain(route.id);
    const latest = (await api.getRoutes(20)).find((r) => r.id === route.id)!;
    expect(latest.status).toBe("rerouted");
    expect(latest.route!.roads.map((x) => x.id)).not.toContain(victim);
    expect((await api.getRoads()).find((r) => r.id === victim)!.is_closed).toBe(true);
    expect((await api.getRoadTraffic(victim)).congestion_level).toBe("closed");
    const recalc = await api.recalcRoute(route.id);
    expect(recalc.changed).toBe(false);
    const resolved = await api.updateIncident(incident.id, { status: "resolved" });   // reopens the road again
    expect(resolved.resolved_at).toBeTruthy();
    expect((await api.getRoads()).find((r) => r.id === victim)!.is_closed).toBe(false);
  });

  it("incidents list/paging and accident analytics", async () => {
    const page = await api.getIncidents({ limit: 2, offset: 0 });
    expect(page.items.length).toBeLessThanOrEqual(2); expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    const hs = await api.getHotspots({}, 150, 8);
    expect(hs.disclaimer).toMatch(/not a prediction/i); expect(hs.hotspots.length).toBeGreaterThan(2);
    const stats = await api.getAccidentAnalytics({ severity: "critical" });
    expect(stats.total).toBe(stats.by_severity.critical);
    expect((await api.getAccidents({}, 5)).items).toHaveLength(5);
  });

  it("simulation start/stop and WebSocket ticks", async () => {
    await signIn("operator");
    const received: { type: string; tick?: number; roads?: unknown[] }[] = [];
    const ws = new WebSocket(wsUrl().replace("localhost:8000", new URL(API_BASE).host));
    ws.onmessage = (e) => received.push(JSON.parse(String(e.data)));
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("websocket failed")); });
    const started = await api.startSim({ signal_mode: "adaptive", demand_multiplier: 1, seed: 1, tick_interval_s: 0.3 });
    expect(started.running).toBe(true);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && received.filter((m) => m.type === "traffic_update").length < 3) await new Promise((r) => setTimeout(r, 100));
    const stopped = await api.stopSim();
    ws.close();
    expect(stopped.running).toBe(false);
    expect(received[0].type).toBe("snapshot");
    const ticks = received.filter((m) => m.type === "traffic_update");
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks[0].roads).toHaveLength(28);
    expect(ticks[2].tick!).toBeGreaterThan(ticks[0].tick!);
    expect((await api.getSimStatus()).running).toBe(false);
  });
});
