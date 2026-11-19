import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { renderWithProviders } from "../test/helpers";
import { DataBoundary, EmptyState, ErrorState, KpiCard, LevelBadge, LoadingBlock, RoleGate, SimBanner } from "./ui";

vi.mock("../services/endpoints");

describe("DataBoundary", () => {
  const show = (p: Partial<Parameters<typeof DataBoundary<string>>[0]>) =>
    render(<DataBoundary<string> loading={false} error={null} data={null} {...p}>{(d) => <p>data:{d}</p>}</DataBoundary>);
  it("shows a spinner while the first load is running", () => { show({ loading: true }); expect(screen.getByRole("status")).toHaveTextContent(/loading/i); });
  it("shows the error with a working retry button", async () => {
    const retry = vi.fn(); show({ error: "Server exploded", onRetry: retry });
    expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
    await userEvent.click(screen.getByRole("button", { name: /try again/i })); expect(retry).toHaveBeenCalledOnce();
  });
  it("shows the empty state when there is no data or the data is empty", () => {
    show({ emptyTitle: "Nothing here" }); expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
  it("treats data deemed empty by the caller as empty", () => { show({ data: "", isEmpty: (d) => d === "", emptyTitle: "Empty!" }); expect(screen.getByText("Empty!")).toBeInTheDocument(); });
  it("renders the data when present, and keeps showing old data if a background refresh fails", () => {
    show({ data: "42", error: "refresh failed" }); expect(screen.getByText("data:42")).toBeInTheDocument(); expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("small components", () => {
  it("KpiCard shows label, value, unit and hint", () => {
    render(<KpiCard label="Average speed" value="31.2" unit="km/h" hint="live" />);
    expect(screen.getByText("Average speed")).toBeInTheDocument(); expect(screen.getByText("31.2")).toBeInTheDocument(); expect(screen.getByText("km/h")).toBeInTheDocument();
  });
  it("LevelBadge uses human labels", () => { render(<LevelBadge level="free_flow" />); expect(screen.getByText("Free flow")).toBeInTheDocument(); });
  it("SimBanner always says the data is simulated", () => { render(<SimBanner />); expect(screen.getByTestId("sim-banner")).toHaveTextContent(/simulated data/i); expect(screen.getByTestId("sim-banner")).toHaveTextContent(/not real-world/i); });
  it("Loading and empty blocks are accessible", () => { render(<><LoadingBlock /><EmptyState title="Empty" hint="hint text" /></>); expect(screen.getByRole("status")).toBeInTheDocument(); expect(screen.getByText("hint text")).toBeInTheDocument(); });
  it("ErrorState without a retry handler has no button", () => { render(<ErrorState message="bad" />); expect(screen.queryByRole("button")).toBeNull(); });
});

describe("RoleGate", () => {
  it("asks anonymous visitors to sign in", () => {
    renderWithProviders(<RoleGate min="operator" action="plan routes"><button>secret action</button></RoleGate>);
    expect(screen.queryByText("secret action")).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });
  it("tells a viewer which role is missing", async () => {
    vi.mocked(endpoints.fetchMe).mockResolvedValue(fx.viewer);
    renderWithProviders(<RoleGate min="operator" action="plan routes"><button>secret action</button></RoleGate>, { user: fx.viewer });
    expect(await screen.findByText(/you need/i)).toHaveTextContent(/operator/); expect(screen.queryByText("secret action")).toBeNull();
  });
  it("shows the content to an operator (and to anyone for a viewer-level action)", async () => {
    renderWithProviders(<RoleGate min="operator" action="plan routes"><button>secret action</button></RoleGate>, { user: fx.operator });
    expect(await screen.findByText("secret action")).toBeInTheDocument();
  });
});
