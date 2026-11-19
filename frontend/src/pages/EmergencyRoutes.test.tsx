import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { apiError, mockReadApi, renderWithProviders } from "../test/helpers";
import { fmtDuration } from "../utils/format";
import EmergencyRoutes from "./EmergencyRoutes";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); vi.mocked(endpoints.planRoute).mockResolvedValue(fx.route); });

async function plan(origin = "1", destination = "15") {
  await userEvent.selectOptions(await screen.findByLabelText("Start"), origin);
  await userEvent.selectOptions(screen.getByLabelText("Destination"), destination);
  await userEvent.click(screen.getByRole("button", { name: /plan route/i }));
}

describe("Emergency routes", () => {
  it("requires an operator", async () => {
    renderWithProviders(<EmergencyRoutes />);
    expect(await screen.findByTestId("role-gate")).toHaveTextContent(/operator/);
    expect(screen.queryByRole("button", { name: /plan route/i })).toBeNull();
  });

  it("the plan button stays disabled until start and destination are chosen", async () => {
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    expect(await screen.findByRole("button", { name: /plan route/i })).toBeDisabled();
  });

  it("sends the exact request for a manual vehicle type and start point", async () => {
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await plan();
    expect(endpoints.planRoute).toHaveBeenCalledWith({ vehicle_type: "ambulance", origin_intersection_id: 1, destination_intersection_id: 15, algorithm: "astar", objective: "fastest", include_alternative: true });
  });

  it("uses the selected unit's own location when a unit is chosen", async () => {
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await userEvent.selectOptions(await screen.findByLabelText("Emergency unit"), String(fx.vehicles[0].id));
    expect(screen.queryByLabelText("Start")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Destination"), "15");
    await userEvent.click(screen.getByRole("button", { name: /plan route/i }));
    expect(endpoints.planRoute).toHaveBeenCalledWith({ vehicle_id: fx.vehicles[0].id, destination_intersection_id: 15, algorithm: "astar", objective: "fastest", include_alternative: true });
  });

  it("shows ETA, distance, fastest-vs-shortest, road list, and draws the route on the map", async () => {
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await plan();
    const details = await screen.findByTestId("route-details");
    expect(details).toHaveTextContent(fmtDuration(fx.route.route!.time_s));
    expect(within(details).getByText(/fastest \(minimum travel time/i)).toBeInTheDocument();
    expect(within(details).getByText(/shortest \(minimum distance/i)).toBeInTheDocument();
    expect(within(details).getAllByRole("listitem").length).toBe(fx.route.route!.roads.length + 1);
    expect(screen.getByTestId("traffic-map")).toHaveAttribute("data-route-points", String(fx.route.route!.geometry.length));
    if (fx.route.alternative) expect(screen.getByTestId("traffic-map")).toHaveAttribute("data-alt-points", String(fx.route.alternative.geometry.length));
  });

  it("passes the chosen algorithm and objective", async () => {
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await userEvent.selectOptions(await screen.findByLabelText("Algorithm"), "dijkstra");
    await userEvent.selectOptions(screen.getByLabelText("Objective"), "shortest");
    await plan();
    expect(endpoints.planRoute).toHaveBeenCalledWith(expect.objectContaining({ algorithm: "dijkstra", objective: "shortest" }));
  });

  it("explains failures such as a cut-off destination", async () => {
    vi.mocked(endpoints.planRoute).mockRejectedValue(await apiError(404, "No open route exists between these intersections (closures may have cut the network)"));
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await plan();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no open route exists/i);
    expect(screen.getByText("No route selected.")).toBeInTheDocument();
  });

  it("lists recent routes and can recalculate one", async () => {
    vi.mocked(endpoints.getRoutes).mockResolvedValue([fx.route]);
    vi.mocked(endpoints.recalcRoute).mockResolvedValue({ route: { ...fx.route, status: "rerouted", reroute_count: 1, note: "Rerouted after a traffic or closure change" }, changed: true, previous_time_s: 100, new_time_s: 120 });
    renderWithProviders(<EmergencyRoutes />, { user: fx.operator });
    await userEvent.click(await screen.findByRole("button", { name: /recalculate/i }));
    expect(endpoints.recalcRoute).toHaveBeenCalledWith(fx.route.id);
    expect(await screen.findByText(/rerouted after a traffic or closure change/i)).toBeInTheDocument();
  });
});
