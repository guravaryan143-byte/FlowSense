import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficStreamProvider, useTrafficStream } from "./useTrafficStream";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  open() { this.onopen?.(); }
  send(obj: unknown) { this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) }); }
  drop() { this.onclose?.(); }
}
const wrapper = ({ children }: { children: ReactNode }) => <TrafficStreamProvider>{children}</TrafficStreamProvider>;
const road = (id: number, level = "heavy") => ({ road_id: id, vehicle_count: 40 + id, average_speed: 20, density: 30, occupancy: 0.6, congestion_level: level, is_closed: false });

beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = []; vi.stubGlobal("WebSocket", FakeSocket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useTrafficStream", () => {
  it("connects once and reports the connection state", () => {
    const { result } = renderHook(() => useTrafficStream(), { wrapper });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toMatch(/\/ws\/traffic$/);
    expect(result.current.connected).toBe(false);
    act(() => FakeSocket.instances[0].open());
    expect(result.current.connected).toBe(true);
  });

  it("turns simulation ticks into per-road and per-signal lookups", () => {
    const { result } = renderHook(() => useTrafficStream(), { wrapper });
    act(() => { FakeSocket.instances[0].open(); FakeSocket.instances[0].send({ type: "traffic_update", tick: 7, sim_time: "2026-11-02T08:00:00+00:00", data_source: "simulated",
      roads: [road(1), road(2, "severe")], signals: [{ intersection_id: 3, current_phase: "EW", ns_green_s: 30, ew_green_s: 52, mode: "adaptive" }],
      summary: { total_vehicles: 100, average_speed: 20, average_density: 30, congested_roads: 2 } }); });
    expect(result.current.running).toBe(true); expect(result.current.tick).toBe(7);
    expect(result.current.roads[2].congestion_level).toBe("severe");
    expect(result.current.signals[3].current_phase).toBe("EW");
    expect(result.current.summary?.total_vehicles).toBe(100);
  });

  it("reads the running flag from status frames and ignores malformed frames", () => {
    const { result } = renderHook(() => useTrafficStream(), { wrapper });
    act(() => { FakeSocket.instances[0].open(); FakeSocket.instances[0].send({ type: "status", running: true }); });
    expect(result.current.running).toBe(true);
    act(() => FakeSocket.instances[0].send("{{{ not json"));
    expect(result.current.running).toBe(true);
  });

  it("reconnects with exponential backoff after the connection drops", () => {
    const { result } = renderHook(() => useTrafficStream(), { wrapper });
    act(() => { FakeSocket.instances[0].open(); FakeSocket.instances[0].drop(); });
    expect(result.current.connected).toBe(false);
    act(() => { vi.advanceTimersByTime(999); });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSocket.instances).toHaveLength(2);             // first retry after 1 s
    act(() => FakeSocket.instances[1].drop());
    act(() => { vi.advanceTimersByTime(1999); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSocket.instances).toHaveLength(3);             // second retry after 2 s
  });

  it("closes the socket and never reconnects after unmount", () => {
    const { unmount } = renderHook(() => useTrafficStream(), { wrapper });
    const socket = FakeSocket.instances[0];
    unmount();
    expect(socket.closed).toBe(true);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("does not open a socket when disabled", () => {
    renderHook(() => useTrafficStream(), { wrapper: ({ children }) => <TrafficStreamProvider enabled={false}>{children}</TrafficStreamProvider> });
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
