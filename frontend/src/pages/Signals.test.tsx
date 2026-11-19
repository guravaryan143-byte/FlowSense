import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { apiError, mockReadApi, renderWithProviders } from "../test/helpers";
import Signals from "./Signals";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); vi.mocked(endpoints.optimizeSignal).mockResolvedValue(fx.optimize); });
const firstId = fx.signals[0].intersection_id;

describe("Signals", () => {
  it("lists all intersections and loads the first one's details", async () => {
    renderWithProviders(<Signals />);
    expect(await screen.findByRole("button", { name: new RegExp(fx.signals[0].intersection_name) })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBe(fx.signals.length);
    await vi.waitFor(() => expect(endpoints.getSignal).toHaveBeenCalledWith(firstId));   // selection happens in an effect after the list loads
    expect(await screen.findByRole("img", { name: /fixed-time plan/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /recommended now/i })).toBeInTheDocument();
  });

  it("switches intersection on click", async () => {
    renderWithProviders(<Signals />);
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(fx.signals[2].intersection_name) }));
    await vi.waitFor(() => expect(endpoints.getSignal).toHaveBeenLastCalledWith(fx.signals[2].intersection_id));
  });

  it("guests must sign in to run a comparison", async () => {
    renderWithProviders(<Signals />);
    expect(await screen.findByTestId("role-gate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run comparison/i })).toBeNull();
  });

  it("runs the comparison and reports measured results, not claims", async () => {
    renderWithProviders(<Signals />, { user: fx.viewer });
    await userEvent.click(await screen.findByRole("button", { name: /run comparison/i }));
    expect(endpoints.optimizeSignal).toHaveBeenCalledWith({ intersection_id: firstId, scenario: "shifting", duration_s: 3600, seed: 42, apply: false });
    const results = await screen.findByTestId("optimize-results");
    expect(within(results).getByRole("status")).toHaveTextContent(fx.optimize.improvement.verdict);
    expect(results).toHaveTextContent(fx.optimize.fixed.avg_wait_s.toFixed(1));
    expect(results).toHaveTextContent(fx.optimize.adaptive.avg_wait_s.toFixed(1));
    expect(within(results).getByText(/same arrivals/i)).toBeInTheDocument();
    expect(screen.getByTestId("queue-chart")).toHaveAttribute("data-fixed", String(fx.optimize.fixed.queue_series.length));
  });

  it("sends the options the user chose", async () => {
    renderWithProviders(<Signals />, { user: fx.viewer });
    await userEvent.selectOptions(await screen.findByLabelText("Traffic scenario"), "balanced");
    await userEvent.selectOptions(screen.getByLabelText("Simulated duration"), "1800");
    await userEvent.clear(screen.getByLabelText("Random seed")); await userEvent.type(screen.getByLabelText("Random seed"), "7");
    await userEvent.click(screen.getByRole("button", { name: /run comparison/i }));
    expect(endpoints.optimizeSignal).toHaveBeenCalledWith({ intersection_id: firstId, scenario: "balanced", duration_s: 1800, seed: 7, apply: false });
  });

  it("viewers cannot apply timing; operators can", async () => {
    const { unmount } = renderWithProviders(<Signals />, { user: fx.viewer });
    expect(await screen.findByLabelText(/apply recommended timing/i)).toBeDisabled();
    unmount();
    renderWithProviders(<Signals />, { user: fx.operator });
    const box = await screen.findByLabelText(/apply recommended timing/i);
    await vi.waitFor(() => expect(box).toBeEnabled());
    await userEvent.click(box);
    vi.mocked(endpoints.optimizeSignal).mockResolvedValueOnce({ ...fx.optimize, applied: true });  // the server confirms it applied the timing
    await userEvent.click(screen.getByRole("button", { name: /run comparison/i }));
    expect(endpoints.optimizeSignal).toHaveBeenCalledWith(expect.objectContaining({ apply: true }));
    expect(await screen.findByText(/timing applied/i)).toBeInTheDocument();
  });

  it("shows API errors instead of failing silently", async () => {
    vi.mocked(endpoints.optimizeSignal).mockRejectedValue(await apiError(403, "Applying timing to a live signal requires the 'operator' role"));
    renderWithProviders(<Signals />, { user: fx.viewer });
    await userEvent.click(await screen.findByRole("button", { name: /run comparison/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/requires the 'operator' role/);
  });

  it("an operator can revert an adaptive signal to fixed-time", async () => {
    vi.mocked(endpoints.getSignal).mockResolvedValue({ ...fx.signalDetail, mode: "adaptive" });
    vi.mocked(endpoints.resetSignal).mockResolvedValue({ ...fx.signalDetail, mode: "fixed" });
    renderWithProviders(<Signals />, { user: fx.operator });
    await userEvent.click(await screen.findByRole("button", { name: /revert to fixed-time/i }));
    expect(endpoints.resetSignal).toHaveBeenCalledWith(firstId);
  });
});
