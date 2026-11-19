import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../hooks/useAuth";
import { TrafficStreamProvider } from "../hooks/useTrafficStream";
import * as endpoints from "../services/endpoints";
import type { User } from "../types";
import { fx } from "./fixtures";

/** Render inside router + auth (+ a disabled stream). Pass `user` to start signed in. Requires vi.mock("../services/endpoints"). */
export function renderWithProviders(ui: ReactElement, { route = "/", user = null }: { route?: string; user?: User | null } = {}) {
  localStorage.clear();
  if (user) {
    localStorage.setItem("flowsense.token", "test-token");
    vi.mocked(endpoints.fetchMe).mockResolvedValue(user);
  }
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider><TrafficStreamProvider enabled={false}>{ui}</TrafficStreamProvider></AuthProvider>
    </MemoryRouter>,
  );
}

/** Default successful answers for every read endpoint (individual tests override what they need). */
export function mockReadApi() {
  const m = vi.mocked(endpoints);
  m.getRoads.mockResolvedValue(fx.roads);
  m.getIntersections.mockResolvedValue(fx.intersections);
  m.getLiveTraffic.mockResolvedValue(fx.live);
  m.getRoadHistory.mockResolvedValue(fx.history);
  m.getOverview.mockResolvedValue(fx.overview);
  m.getTrends.mockResolvedValue(fx.trends);
  m.getPredictionOverview.mockResolvedValue(fx.predictionOverview);
  m.getModelInfo.mockResolvedValue(fx.modelInfo);
  m.getRoadPrediction.mockResolvedValue({ road_id: 1, model_available: true, latest: null, history: [] });
  m.getSignals.mockResolvedValue(fx.signals);
  m.getSignal.mockResolvedValue(fx.signalDetail);
  m.getVehicles.mockResolvedValue(fx.vehicles);
  m.getRoutes.mockResolvedValue([]);
  m.getHotspots.mockResolvedValue(fx.hotspots);
  m.getAccidentAnalytics.mockResolvedValue(fx.accidentAnalytics);
  m.getAccidents.mockResolvedValue(fx.accidents);
  m.getIncidents.mockResolvedValue(fx.incidents);
  m.getSimStatus.mockResolvedValue({ running: false, data_source: "simulated", tick: 0, sim_time: null, signal_mode: null, tick_interval_s: null, minutes_per_tick: null, demand_multiplier: null, connected_clients: 0, last_error: null });
  m.getHealth.mockResolvedValue({ status: "ok", database: "ok", model_available: true, simulation_running: false });
}

/** An Axios-shaped API error, as the backend would send it. */
export async function apiError(status: number, message: string) {
  const { AxiosError } = await import("axios");
  return new AxiosError(message, "ERR_BAD_REQUEST", undefined, undefined, { status, data: { error: "x", message }, statusText: "", headers: {}, config: {} as never });
}
