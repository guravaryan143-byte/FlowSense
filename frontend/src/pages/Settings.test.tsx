import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { mockReadApi, renderWithProviders } from "../test/helpers";
import Settings from "./Settings";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); vi.mocked(endpoints.listUsers).mockResolvedValue([fx.admin, fx.operator, fx.viewer]); });

describe("Settings", () => {
  it("guests are invited to sign in", async () => {
    renderWithProviders(<Settings />);
    expect(await screen.findByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText(/all traffic, accident and incident figures are simulated/i)).toBeInTheDocument();
  });

  it("shows the account of the signed-in user", async () => {
    renderWithProviders(<Settings />, { user: fx.operator });
    expect(await screen.findByText(fx.operator.email)).toBeInTheDocument();
    expect(screen.getAllByText("operator").length).toBeGreaterThan(0);
  });

  it("reports system health from the API", async () => {
    renderWithProviders(<Settings />);
    const status = (await screen.findByText("System status")).closest("section") as HTMLElement;
    expect(await within(status).findByText("trained")).toBeInTheDocument();
    vi.mocked(endpoints.getHealth).mockResolvedValue({ status: "ok", database: "ok", model_available: false, simulation_running: false });
  });

  it("only admins can manage users", async () => {
    renderWithProviders(<Settings />, { user: fx.operator });
    expect(await screen.findByTestId("role-gate")).toHaveTextContent(/admin/);
    expect(endpoints.listUsers).not.toHaveBeenCalled();
  });

  it("an admin can change a user's role", async () => {
    vi.mocked(endpoints.setUserRole).mockResolvedValue({ ...fx.viewer, role: "operator" });
    renderWithProviders(<Settings />, { user: fx.admin });
    const select = await screen.findByLabelText(`Role for ${fx.viewer.name}`);
    await userEvent.selectOptions(select, "operator");
    expect(endpoints.setUserRole).toHaveBeenCalledWith(fx.viewer.id, "operator");
    await vi.waitFor(() => expect(endpoints.listUsers).toHaveBeenCalledTimes(2));   // list refreshed
  });

  it("shows the server's refusal when a role change fails", async () => {
    vi.mocked(endpoints.setUserRole).mockRejectedValue(new Error("not allowed"));
    renderWithProviders(<Settings />, { user: fx.admin });
    await userEvent.selectOptions(await screen.findByLabelText(`Role for ${fx.viewer.name}`), "admin");
    expect(await screen.findByRole("alert")).toHaveTextContent("not allowed");
  });
});
