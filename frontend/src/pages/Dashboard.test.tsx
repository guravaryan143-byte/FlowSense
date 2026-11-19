import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { mockReadApi, renderWithProviders } from "../test/helpers";
import { fmtDec, fmtInt } from "../utils/format";
import Dashboard from "./Dashboard";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));

const kpi = (label: string) => within(screen.getByText(label).closest("[data-testid=kpi]") as HTMLElement);
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); });

describe("Dashboard", () => {
  it("shows every KPI from the API, not from constants", async () => {
    renderWithProviders(<Dashboard />);
    const s = fx.live.summary;
    expect(await screen.findByText(fmtInt(s.total_vehicles))).toBeInTheDocument();
    expect(kpi("Vehicles monitored").getByText(fmtInt(s.total_vehicles))).toBeInTheDocument();
    expect(kpi("Roads").getByText(`${s.open_roads}/${s.road_count}`)).toBeInTheDocument();
    expect(kpi("Congested roads").getByText(fmtInt(s.congested_roads))).toBeInTheDocument();
    expect(kpi("Average speed").getByText(fmtDec(s.average_speed))).toBeInTheDocument();
    expect(kpi("Average density").getByText(fmtDec(s.average_density))).toBeInTheDocument();
    expect(kpi("Active incidents").getByText(fmtInt(fx.overview.active_incidents))).toBeInTheDocument();
  });

  it("changes when the API data changes (proves nothing is hard-coded)", async () => {
    vi.mocked(endpoints.getLiveTraffic).mockResolvedValue({ ...fx.live, summary: { ...fx.live.summary, total_vehicles: 31337, congested_roads: 0 } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("31,337")).toBeInTheDocument();
    expect(kpi("Congested roads").getByText("0")).toBeInTheDocument();
  });

  it("always labels the data as simulated", async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByTestId("sim-banner")).toHaveTextContent(/simulated data/i);
  });

  it("hands the backend's roads and incidents to the map and the distribution to the donut", async () => {
    renderWithProviders(<Dashboard />);
    const map = await screen.findByTestId("traffic-map");
    expect(map).toHaveAttribute("data-roads", String(fx.roads.length));
    expect(map).toHaveAttribute("data-incidents", String(fx.incidents.items.length));
    expect(await screen.findByTestId("level-donut")).toHaveTextContent(`free_flow:${fx.live.summary.level_counts.free_flow}`);
  });

  it("summarises the congestion forecast and the incident feed", async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText(/roads expected to be heavy or severe/i)).toBeInTheDocument();
    const roadName = fx.incidents.items[0].road_name as string;   // plain substring match: road names contain "(" and ")"
    expect((await screen.findAllByText((t) => t.includes(roadName))).length).toBeGreaterThan(0);
  });

  it("explains when the model is not trained", async () => {
    vi.mocked(endpoints.getPredictionOverview).mockResolvedValue({ model_available: false, message: "Model not trained yet.", horizon_minutes: null, summary: {}, predictions: [] });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText(/prediction model not trained yet/i)).toBeInTheDocument();
  });

  it("shows empty states instead of blank cards", async () => {
    vi.mocked(endpoints.getIncidents).mockResolvedValue({ items: [], total: 0, limit: 6, offset: 0 });
    vi.mocked(endpoints.getTrends).mockResolvedValue({ ...fx.trends, series: [] });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("No active incidents")).toBeInTheDocument();
    expect(await screen.findAllByText("No traffic history yet")).not.toHaveLength(0);
  });

  it("shows a readable error with a retry that recovers", async () => {
    vi.mocked(endpoints.getLiveTraffic).mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"));
    renderWithProviders(<Dashboard />);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]).toHaveTextContent(/cannot reach the flowsense api/i);
    await userEvent.click(screen.getAllByRole("button", { name: /try again/i })[0]);
    expect(await screen.findByText(fmtInt(fx.live.summary.total_vehicles))).toBeInTheDocument();
    expect(endpoints.getLiveTraffic).toHaveBeenCalledTimes(2);
  });
});
