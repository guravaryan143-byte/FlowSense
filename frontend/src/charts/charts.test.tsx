/** Renders the REAL Recharts components (only the responsive wrapper is given a fixed size, since jsdom has no layout). */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fx } from "../test/fixtures";
import { BarsChart, CompareBarsChart, HistoryChart, HourlyComparisonChart, LevelDonut, QueueChart, TrendChart } from "./charts";

vi.mock("recharts", async (orig) => {
  const mod = await orig<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return { ...mod, ResponsiveContainer: ({ children }: { children: React.ReactElement }) => cloneElement(children, { width: 800, height: 300 } as object) };
});

const svg = (c: HTMLElement) => c.querySelector("svg.recharts-surface");

describe("charts render with real API data", () => {
  it("TrendChart draws two lines with a legend", () => {
    const { container } = render(<TrendChart series={fx.trends.series} />);
    expect(svg(container)).not.toBeNull();
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
    expect(container).toHaveTextContent("Avg speed (km/h)");
  });
  it("HistoryChart draws speed and density", () => {
    const { container } = render(<HistoryChart points={fx.history.items} />);
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
  });
  it("HourlyComparisonChart adds the previous-week line only when there is data for it", () => {
    const withPrev = render(<HourlyComparisonChart current={fx.trends.hourly_pattern} previous={fx.trends.hourly_pattern} />);
    expect(withPrev.container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
    const without = render(<HourlyComparisonChart current={fx.trends.hourly_pattern} previous={[]} />);
    expect(without.container.querySelectorAll("path.recharts-line-curve")).toHaveLength(1);
  });
  it("QueueChart compares fixed and adaptive", () => {
    const { container } = render(<QueueChart fixed={fx.optimize.fixed.queue_series} adaptive={fx.optimize.adaptive.queue_series} />);
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
    expect(container).toHaveTextContent("Adaptive");
  });
  // Recharts draws each bar's <path> only after its entry animation, and jsdom runs no animation frames,
  // so we count the per-datum bar groups (one is created for every datum) rather than the final paths.
  const bars = (c: HTMLElement) => c.querySelectorAll("g.recharts-bar-rectangle").length;
  it("BarsChart creates one bar per datum, in both orientations", () => {
    const data = [{ label: "a", value: 3 }, { label: "b", value: 5 }, { label: "c", value: 1 }];
    expect(bars(render(<BarsChart data={data} label="x" />).container)).toBe(3);
    expect(bars(render(<BarsChart data={data} label="y" horizontal />).container)).toBe(3);
  });
  it("CompareBarsChart creates two bars per road", () => {
    const { container } = render(<CompareBarsChart data={[{ label: "r1", now: 10, forecast: 20 }, { label: "r2", now: 5, forecast: 4 }]} />);
    expect(bars(container)).toBe(4);
    expect(container).toHaveTextContent("Forecast");
  });
  it("LevelDonut lists the real counts per level", () => {
    const { container } = render(<LevelDonut counts={fx.live.summary.level_counts} />);
    expect(container).toHaveTextContent("Free flow");
    expect(container).toHaveTextContent(String(fx.live.summary.level_counts.free_flow));
    expect(container.querySelector("[role=img]")).toHaveAttribute("aria-label", "Congestion distribution");
  });
});
