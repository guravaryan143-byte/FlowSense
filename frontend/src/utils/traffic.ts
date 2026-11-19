import type { LiveTraffic, RoadTraffic, StreamRoad, TrafficSummary } from "../types";

/** Same rules as the backend's `summarise`: closed roads are excluded from vehicle/speed/density figures. */
export function summarizeRoads(roads: RoadTraffic[], asOf: string | null): TrafficSummary {
  const open = roads.filter((r) => !r.is_closed);
  const n = open.length || 1;
  const level_counts: Record<string, number> = { free_flow: 0, moderate: 0, heavy: 0, severe: 0, closed: 0 };
  roads.forEach((r) => { level_counts[r.congestion_level] += 1; });
  return {
    total_vehicles: open.reduce((s, r) => s + r.vehicle_count, 0),
    road_count: roads.length,
    open_roads: open.length,
    average_speed: Math.round((open.reduce((s, r) => s + r.average_speed, 0) / n) * 10) / 10,
    average_density: Math.round((open.reduce((s, r) => s + r.density, 0) / n) * 100) / 100,
    congested_roads: level_counts.heavy + level_counts.severe,
    level_counts,
    as_of: asOf,
  };
}

/** Overlay live WebSocket values on top of the last REST snapshot. */
export function mergeStream(base: LiveTraffic, stream: Record<number, StreamRoad>, simTime: string | null): LiveTraffic {
  if (Object.keys(stream).length === 0) return base;
  const roads = base.roads.map((r) => {
    const s = stream[r.road_id];
    return s ? { ...r, vehicle_count: s.vehicle_count, average_speed: s.average_speed, density: s.density,
                 occupancy: s.occupancy, congestion_level: s.congestion_level, is_closed: s.is_closed, recorded_at: simTime ?? r.recorded_at } : r;
  });
  return { ...base, roads, summary: summarizeRoads(roads, simTime ?? base.summary.as_of) };
}
