import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { mockReadApi, renderWithProviders } from "../test/helpers";
import Accidents from "./Accidents";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); });

describe("Accident analytics", () => {
  it("ranks the hotspots returned by the API and places them on the map", async () => {
    renderWithProviders(<Accidents />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getAllByRole("row").length - 1).toBe(fx.hotspots.hotspots.length);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(fx.hotspots.hotspots[0].nearest_road as string);
    expect(screen.getByTestId("traffic-map")).toHaveAttribute("data-hotspots", String(fx.hotspots.hotspots.length));
  });

  it("states clearly that hotspots are descriptive, not predictions, and that the data is simulated", async () => {
    renderWithProviders(<Accidents />);
    expect(await screen.findByRole("note")).toHaveTextContent(/not a prediction/i);
    expect(screen.getByRole("note")).toHaveTextContent(/simulated/i);
  });

  it("shows statistics from the API", async () => {
    renderWithProviders(<Accidents />);
    const stats = await screen.findByRole("region", { name: /accident statistics/i });
    expect(stats).toHaveTextContent(String(fx.accidentAnalytics.total));
    expect(stats).toHaveTextContent(String(fx.hotspots.noise_accidents));
    expect((await screen.findAllByTestId("bars-chart")).length).toBe(4);
  });

  it("re-queries with the chosen severity, radius and minimum cluster size", async () => {
    renderWithProviders(<Accidents />);
    await screen.findAllByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Severity"), "critical");
    await userEvent.selectOptions(screen.getByLabelText("Cluster radius"), "200");
    await userEvent.selectOptions(screen.getByLabelText("Minimum accidents per hotspot"), "12");
    await vi.waitFor(() => expect(endpoints.getHotspots).toHaveBeenLastCalledWith({ severity: "critical" }, 200, 12));
    expect(endpoints.getAccidentAnalytics).toHaveBeenLastCalledWith({ severity: "critical" });
  });

  it("the period filter sends a start date", async () => {
    renderWithProviders(<Accidents />);
    await screen.findAllByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Time period"), "30");
    await vi.waitFor(() => {
      const [filters] = vi.mocked(endpoints.getHotspots).mock.lastCall!;
      expect(Date.parse(filters.date_from as string)).toBeGreaterThan(Date.now() - 31 * 86_400_000);
    });
  });

  it("explains an empty result", async () => {
    vi.mocked(endpoints.getHotspots).mockResolvedValue({ ...fx.hotspots, hotspots: [], clustered_accidents: 0, noise_accidents: 5 });
    renderWithProviders(<Accidents />);
    expect(await screen.findByText(/no hotspots with these settings/i)).toBeInTheDocument();
  });
});
