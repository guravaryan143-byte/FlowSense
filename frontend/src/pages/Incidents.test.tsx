import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { apiError, mockReadApi, renderWithProviders } from "../test/helpers";
import Incidents from "./Incidents";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); });
const inc = fx.incidents.items[0];

describe("Incidents", () => {
  it("lists incidents from the API with their status and severity", async () => {
    renderWithProviders(<Incidents />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getAllByRole("row").length - 1).toBe(fx.incidents.items.length);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(inc.severity);
    expect(screen.getByTestId("traffic-map")).toHaveAttribute("data-incidents", String(fx.incidents.items.length));
  });

  it("guests see a sign-in prompt instead of the report form, and no operator controls", async () => {
    renderWithProviders(<Incidents />);
    expect(await screen.findByTestId("role-gate")).toHaveTextContent(/report an incident/);
    expect(screen.queryByRole("button", { name: /report incident/i })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull();
  });

  it("reports an incident with exactly the fields entered", async () => {
    vi.mocked(endpoints.createIncident).mockResolvedValue({ ...inc, id: 77, road_name: "Central Avenue (Second Section)" });
    renderWithProviders(<Incidents />, { user: fx.viewer });
    await userEvent.selectOptions(await screen.findByLabelText("Road"), "5");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "flooding");
    await userEvent.selectOptions(screen.getByLabelText("Severity", { selector: "#inc-sev" }), "high");
    await userEvent.type(screen.getByLabelText("Description"), "Water over the carriageway");
    await userEvent.click(screen.getByRole("button", { name: /report incident/i }));
    expect(endpoints.createIncident).toHaveBeenCalledWith({ road_id: 5, incident_type: "flooding", severity: "high", description: "Water over the carriageway" });
    expect(await screen.findByRole("status")).toHaveTextContent("Incident #77 reported on Central Avenue (Second Section)");
  });

  it("validates before calling the API", async () => {
    renderWithProviders(<Incidents />, { user: fx.viewer });
    await userEvent.click(await screen.findByRole("button", { name: /report incident/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose the road/i);
    expect(endpoints.createIncident).not.toHaveBeenCalled();
  });

  it("shows server-side validation errors", async () => {
    vi.mocked(endpoints.createIncident).mockRejectedValue(await apiError(404, "Road 5 not found"));
    renderWithProviders(<Incidents />, { user: fx.viewer });
    await userEvent.selectOptions(await screen.findByLabelText("Road"), "5");
    await userEvent.click(screen.getByRole("button", { name: /report incident/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Road 5 not found");
  });

  it("counts description characters (limit 1000)", async () => {
    renderWithProviders(<Incidents />, { user: fx.viewer });
    await userEvent.type(await screen.findByLabelText("Description"), "abc");
    expect(screen.getByText("3/1000")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveAttribute("maxlength", "1000");
  });

  it("operators can move an incident along its workflow", async () => {
    vi.mocked(endpoints.updateIncident).mockResolvedValue({ ...inc, status: "resolved" });
    renderWithProviders(<Incidents />, { user: fx.operator });
    const select = await screen.findByLabelText(`New status for incident ${inc.id}`);
    const chosen = (select as HTMLSelectElement).options[1].value;           // first allowed next status
    await userEvent.selectOptions(select, chosen);
    await userEvent.click(within(select.closest("tr") as HTMLElement).getByRole("button", { name: "Update" }));
    expect(endpoints.updateIncident).toHaveBeenCalledWith(inc.id, { status: chosen });
    expect(await screen.findByRole("status")).toHaveTextContent(/is now/i);
  });

  it("only offers statuses the workflow allows (never back to 'reported')", async () => {
    renderWithProviders(<Incidents />, { user: fx.operator });
    const select = await screen.findByLabelText(`New status for incident ${inc.id}`);
    expect(within(select).queryByRole("option", { name: "Reported" })).toBeNull();
  });

  it("operators can close the road and see the re-routing result", async () => {
    const target = fx.incidents.items.find((i) => i.road_id !== null && i.status !== "resolved" && !i.closes_road)!;
    vi.mocked(endpoints.closeRoad).mockResolvedValue({ incident: { ...target, closes_road: true }, road_id: target.road_id!, rerouted_route_ids: [3], cancelled_route_ids: [], message: "Test Road is closed. 1 emergency route(s) re-planned, 0 cancelled (no open path)." });
    renderWithProviders(<Incidents />, { user: fx.operator });
    const row = (await screen.findByLabelText(`New status for incident ${target.id}`)).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /close road/i }));
    expect(endpoints.closeRoad).toHaveBeenCalledWith(target.id);
    expect(await screen.findByRole("status")).toHaveTextContent(/1 emergency route\(s\) re-planned/);
  });

  it("filters are sent to the API and reset paging", async () => {
    renderWithProviders(<Incidents />);
    await screen.findAllByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "resolved");
    await userEvent.click(screen.getByLabelText(/hide resolved/i));
    await vi.waitFor(() => expect(endpoints.getIncidents).toHaveBeenLastCalledWith({ status: "resolved", active_only: false, limit: 10, offset: 0 }));
  });

  it("shows an empty state when nothing matches", async () => {
    vi.mocked(endpoints.getIncidents).mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });
    renderWithProviders(<Incidents />);
    expect(await screen.findByText(/no incidents match these filters/i)).toBeInTheDocument();
  });
});
