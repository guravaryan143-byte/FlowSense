import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { mockReadApi, renderWithProviders } from "../test/helpers";
import { fmtDec, fmtInt } from "../utils/format";
import Landing from "./Landing";

vi.mock("../services/endpoints");
beforeEach(() => {
  vi.resetAllMocks();
  mockReadApi();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); // jsdom has no 2D canvas; the layer falls back to its CSS mask
});

const live = () => screen.findByRole("region", { name: /the network, right now/i });

describe("Landing: hero", () => {
  it("opens with the headline and calls to action that go to real places", () => {
    renderWithProviders(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Traffic has a second layer.FlowSense reads it.");
    const dash = screen.getAllByRole("link", { name: /^open (the )?dashboard$/i });
    expect(dash.length).toBeGreaterThanOrEqual(3); // nav, hero, closing call to action
    dash.forEach((a) => expect(a).toHaveAttribute("href", "/dashboard"));
    expect(screen.getByRole("link", { name: /see how it works/i })).toHaveAttribute("href", "#how");
  });

  it("keeps both image layers out of the accessibility tree", () => {
    renderWithProviders(<Landing />);
    const hero = document.getElementById("top") as HTMLElement;
    const imgs = hero.querySelectorAll("img");
    expect(imgs.length).toBe(2); // street layer + revealed signal layer
    imgs.forEach((img) => expect(img).toHaveAttribute("alt", ""));
    expect(screen.getByTestId("reveal-layer")).toHaveAttribute("aria-hidden", "true");
  });

  it("explains the colours the revealed layer uses", () => {
    renderWithProviders(<Landing />);
    const legend = screen.getByRole("list", { name: /congestion colours/i });
    ["Free flow", "Moderate", "Heavy", "Severe"].forEach((l) => expect(within(legend).getByText(l)).toBeInTheDocument());
  });

  it("says plainly that the data is simulated", () => {
    renderWithProviders(<Landing />);
    expect(screen.getAllByText(/simulated/i).length).toBeGreaterThan(2);
    expect(screen.getAllByText(/fictional road network/i).length).toBeGreaterThanOrEqual(2); // hero caption and footer
  });
});

describe("Landing: modules", () => {
  it("lists the seven modules and every row opens its real page", () => {
    renderWithProviders(<Landing />);
    const region = screen.getByRole("region", { name: /seven modules/i });
    const links = within(region).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/traffic", "/predictions", "/signals", "/emergency", "/accidents", "/dashboard", "/incidents"]);
    expect(within(region).getByText("Emergency routing")).toBeInTheDocument();
  });

  it("does not claim a police service, which the system does not model", () => {
    renderWithProviders(<Landing />);
    expect(screen.queryByText(/police/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/ambulances and fire engines/i).length).toBeGreaterThan(0);
  });
});

describe("Landing: live data", () => {
  it("shows the network figures from the API, not from constants", async () => {
    renderWithProviders(<Landing />);
    const s = fx.live.summary;
    const region = await live();
    expect(await within(region).findByText(fmtInt(s.total_vehicles))).toBeInTheDocument();
    expect(within(region).getByText(fmtDec(s.average_speed))).toBeInTheDocument();
    expect(within(region).getByText(`of ${s.open_roads}`)).toBeInTheDocument();
    expect(within(region).getByText("Simulated data")).toBeInTheDocument();
  });

  it("describes the congestion bar in words for screen readers", async () => {
    renderWithProviders(<Landing />);
    const bar = await screen.findByRole("img", { name: /congestion across \d+ roads/i });
    expect(bar.getAttribute("aria-label")).toMatch(new RegExp(`${fx.live.summary.road_count} roads`));
  });

  it("shows the real forecast scores and the honest caveat", async () => {
    renderWithProviders(<Landing />);
    const info = fx.modelInfo.info!;
    const region = await live();
    const rf = info.metrics.random_forest.target_density.mae.toFixed(2);
    expect((await within(region).findAllByText(rf)).length).toBeGreaterThan(0);
    expect(within(region).getByText(info.metrics.baseline_persistence.target_density.mae.toFixed(2))).toBeInTheDocument();
    const pct = info.density_mae_improvement_vs_persistence_pct!;
    expect(within(region).getByText(`${fmtDec(pct)}% lower error than persistence.`)).toBeInTheDocument();
    expect(within(region).getByText(/measures the model against the simulator, not against real roads/i)).toBeInTheDocument();
  });

  it("shows a loading state while the API answers", () => {
    vi.mocked(endpoints.getLiveTraffic).mockReturnValue(new Promise(() => {}));
    vi.mocked(endpoints.getModelInfo).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Landing />);
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a readable error with a retry that recovers", async () => {
    vi.mocked(endpoints.getLiveTraffic).mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"));
    renderWithProviders(<Landing />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(/cannot reach the flowsense api/i);
    await userEvent.click(screen.getAllByRole("button", { name: /try again/i })[0]);
    expect(await screen.findByText(fmtInt(fx.live.summary.total_vehicles))).toBeInTheDocument();
    expect(endpoints.getLiveTraffic).toHaveBeenCalledTimes(2);
  });

  it("explains how to load data when there are no readings", async () => {
    vi.mocked(endpoints.getLiveTraffic).mockResolvedValue({ ...fx.live, roads: [] });
    renderWithProviders(<Landing />);
    expect(await screen.findByText("No traffic readings yet")).toBeInTheDocument();
    expect(screen.getByText(/python -m app\.seed/)).toBeInTheDocument();
  });

  it("explains how to train when no forecasting model is loaded", async () => {
    vi.mocked(endpoints.getModelInfo).mockResolvedValue({ available: false, message: "Model not trained yet.", info: null });
    renderWithProviders(<Landing />);
    expect(await screen.findByText("No forecasting model is loaded")).toBeInTheDocument();
    expect(screen.getByText(/python -m app\.ml\.train/)).toBeInTheDocument();
  });
});

describe("Landing: navigation", () => {
  it("offers section links, and Sign in only to visitors who are not signed in", async () => {
    renderWithProviders(<Landing />);
    const nav = screen.getByRole("navigation", { name: /page sections/i });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#modules", "#live", "#how"]);
    expect(screen.getAllByRole("link", { name: /^sign in$/i }).length).toBeGreaterThan(0);
  });

  it("hides Sign in once someone is signed in", async () => {
    renderWithProviders(<Landing />, { user: fx.operator });
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /^sign in$/i })).toHaveLength(0));
  });

  it("mobile menu: toggles with correct aria state, closes on Escape, and releases page scroll", async () => {
    renderWithProviders(<Landing />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "landing-menu");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("landing-menu")).toHaveAttribute("data-open", "true");
    expect(document.documentElement.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /open menu/i })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("landing-menu")).toHaveAttribute("data-open", "false");
    expect(document.documentElement.style.overflow).not.toBe("hidden");
  });

  it("mobile menu: choosing a link closes the menu", async () => {
    renderWithProviders(<Landing />);
    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const mobile = screen.getByRole("navigation", { name: /^mobile$/i });
    await userEvent.click(within(mobile).getByRole("link", { name: "Live data" }));
    expect(document.getElementById("landing-menu")).toHaveAttribute("data-open", "false");
  });

  it("offers a skip link for keyboard users", () => {
    renderWithProviders(<Landing />);
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")).toBeInTheDocument();
  });
});
