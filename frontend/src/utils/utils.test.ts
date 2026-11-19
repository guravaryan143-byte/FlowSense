import { describe, expect, it } from "vitest";
import { fx } from "../test/fixtures";
import type { RoadTraffic, StreamRoad } from "../types";
import { LEVEL_COLOR, levelColor, levelLabel, levelRank } from "./congestion";
import { fmtDateTime, fmtDec, fmtDistance, fmtDuration, fmtInt, fmtPct, titleCase } from "./format";
import { mergeStream, summarizeRoads } from "./traffic";

describe("formatters", () => {
  it("formats durations and distances for humans", () => {
    expect(fmtDuration(252.4)).toBe("4 min 12 s");
    expect(fmtDuration(45)).toBe("45 s");
    expect(fmtDistance(850)).toBe("850 m");
    expect(fmtDistance(3943.6)).toBe("3.94 km");
  });
  it("shows an em dash for missing values and signs for percentages", () => {
    expect(fmtInt(null)).toBe("—"); expect(fmtDec(undefined)).toBe("—"); expect(fmtDuration(null)).toBe("—"); expect(fmtPct(null)).toBe("—");
    expect(fmtPct(-61.4)).toBe("-61.4%"); expect(fmtPct(5)).toBe("+5.0%"); expect(fmtPct(5, false)).toBe("5.0%");
    expect(fmtInt(12345)).toBe("12,345");
  });
  it("formats ISO timestamps in UTC and tolerates garbage", () => {
    expect(fmtDateTime("2026-11-02T08:15:00Z")).toContain("08:15");
    expect(fmtDateTime("not a date")).toBe("—"); expect(fmtDateTime(null)).toBe("—");
    expect(titleCase("fire_service")).toBe("Fire Service");
  });
});

describe("congestion helpers", () => {
  it("maps levels to colours, labels and a worst-first rank", () => {
    expect(levelLabel("free_flow")).toBe("Free flow");
    expect(levelColor("severe")).toBe(LEVEL_COLOR.severe);
    expect(levelColor("unknown")).toBe("#64748b");
    expect(["severe", "free_flow", "heavy", "moderate"].sort((a, b) => levelRank(b) - levelRank(a))).toEqual(["severe", "heavy", "moderate", "free_flow"]);
  });
});

describe("traffic summaries", () => {
  it("summarizeRoads reproduces the backend summary exactly (contract consistency)", () => {
    const mine = summarizeRoads(fx.live.roads, fx.live.summary.as_of);
    expect(mine).toEqual(fx.live.summary);
  });
  it("excludes closed roads from vehicle and speed figures", () => {
    const roads: RoadTraffic[] = fx.live.roads.map((r, i) => (i === 0 ? { ...r, is_closed: true, congestion_level: "closed" } : r));
    const s = summarizeRoads(roads, null);
    expect(s.open_roads).toBe(roads.length - 1);
    expect(s.level_counts.closed).toBe(1);
    expect(s.total_vehicles).toBe(roads.slice(1).reduce((t, r) => t + r.vehicle_count, 0));
  });
  it("mergeStream overlays live values and recomputes the summary; no stream leaves data untouched", () => {
    expect(mergeStream(fx.live, {}, null)).toBe(fx.live);
    const first = fx.live.roads[0];
    const tick: StreamRoad = { road_id: first.road_id, vehicle_count: 999, average_speed: 12, density: 50, occupancy: 0.8, congestion_level: "severe", is_closed: false };
    const merged = mergeStream(fx.live, { [first.road_id]: tick }, "2026-11-02T09:00:00+00:00");
    expect(merged.roads[0].vehicle_count).toBe(999);
    expect(merged.roads[0].congestion_level).toBe("severe");
    expect(merged.roads[1]).toEqual(fx.live.roads[1]);
    expect(merged.summary.total_vehicles).toBe(fx.live.summary.total_vehicles - first.vehicle_count + 999);
    expect(merged.summary.as_of).toBe("2026-11-02T09:00:00+00:00");
  });
});
