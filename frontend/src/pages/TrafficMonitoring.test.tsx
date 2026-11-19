import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { mockReadApi, renderWithProviders } from "../test/helpers";
import { levelRank } from "../utils/congestion";
import TrafficMonitoring from "./TrafficMonitoring";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); });

describe("Traffic monitoring", () => {
  it("lists every road, worst congestion first", async () => {
    renderWithProviders(<TrafficMonitoring />);
    await screen.findByText("All roads");
    const rows = await screen.findAllByRole("row");
    expect(rows.length - 1).toBe(fx.live.roads.length);
    const worst = [...fx.live.roads].sort((a, b) => levelRank(b.congestion_level) - levelRank(a.congestion_level) || b.occupancy - a.occupancy)[0];
    expect(rows[1]).toHaveTextContent(worst.road_name);
  });

  it("filters by search text and by congestion level", async () => {
    renderWithProviders(<TrafficMonitoring />);
    await screen.findAllByRole("row");
    await userEvent.type(screen.getByLabelText("Search roads"), "Ring Road North");
    const matches = fx.live.roads.filter((r) => r.road_name.toLowerCase().includes("ring road north")).length;
    expect((await screen.findAllByRole("row")).length - 1).toBe(matches);
    await userEvent.clear(screen.getByLabelText("Search roads"));
    const level = fx.live.roads[0].congestion_level;
    await userEvent.selectOptions(screen.getByLabelText("Filter by congestion level"), level);
    expect((await screen.findAllByRole("row")).length - 1).toBe(fx.live.roads.filter((r) => r.congestion_level === level).length);
    await userEvent.type(screen.getByLabelText("Search roads"), "zzzz-no-such-road");
    expect(await screen.findByText(/no roads match your filters/i)).toBeInTheDocument();
  });

  it("selecting a road (from the map) loads its 24 h history and details", async () => {
    renderWithProviders(<TrafficMonitoring />);
    expect(screen.getByText("No road selected.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "map-road-1" }));
    expect(await screen.findByTestId("history-chart")).toHaveAttribute("data-points", String(fx.history.items.length));
    expect(endpoints.getRoadHistory).toHaveBeenCalledWith(1, 24);
    expect(screen.getByTestId("traffic-map")).toHaveAttribute("data-selected", "1");
    expect(screen.getAllByTestId("kpi")).toHaveLength(4);   // vehicles, speed, density, occupancy
  });

  it("selecting a road from the table works too", async () => {
    renderWithProviders(<TrafficMonitoring />);
    const row = (await screen.findAllByRole("row"))[1];
    await userEvent.click(within(row).getByRole("button"));
    expect(await screen.findByTestId("history-chart")).toBeInTheDocument();
  });

  it("tells guests they need an operator account to run the simulation", async () => {
    renderWithProviders(<TrafficMonitoring />);
    expect(await screen.findByTestId("role-gate")).toHaveTextContent(/operator/);
    expect(screen.queryByRole("button", { name: /start simulation/i })).toBeNull();
  });

  it("lets an operator start the simulation with the chosen options", async () => {
    vi.mocked(endpoints.startSim).mockResolvedValue({ ...(await endpoints.getSimStatus()), running: true });
    renderWithProviders(<TrafficMonitoring />, { user: fx.operator });
    await userEvent.selectOptions(await screen.findByLabelText("Signal control"), "adaptive");
    await userEvent.click(screen.getByRole("button", { name: /start simulation/i }));
    expect(endpoints.startSim).toHaveBeenCalledWith({ signal_mode: "adaptive", demand_multiplier: 1, seed: 42 });
  });

  it("shows an error and recovers when the live feed fails", async () => {
    vi.mocked(endpoints.getLiveTraffic).mockRejectedValueOnce(new Error("feed down"));
    renderWithProviders(<TrafficMonitoring />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("feed down");
    await userEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect((await screen.findAllByRole("row")).length - 1).toBe(fx.live.roads.length);
  });
});
