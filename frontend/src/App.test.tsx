import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { TrafficStreamProvider } from "./hooks/useTrafficStream";
import { NAV } from "./layouts/AppLayout";
import * as endpoints from "./services/endpoints";
import { fx } from "./test/fixtures";
import { mockReadApi } from "./test/helpers";
import type { User } from "./types";

vi.mock("./services/endpoints");
vi.mock("./maps/TrafficMap", async () => await import("./test/mockMap"));
vi.mock("./charts/charts", async () => await import("./test/mockCharts"));

beforeEach(() => {
  vi.resetAllMocks();
  mockReadApi();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

function renderApp(route: string, user: User | null = null) {
  localStorage.clear();
  if (user) {
    localStorage.setItem("flowsense.token", "test-token");
    vi.mocked(endpoints.fetchMe).mockResolvedValue(user);
  }
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider><TrafficStreamProvider enabled={false}><App /></TrafficStreamProvider></AuthProvider>
    </MemoryRouter>,
  );
}

describe("routing: the front door", () => {
  it("shows the landing page to a visitor at /", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: /traffic has a second layer/i }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("sends a signed-in user at / straight to the dashboard", async () => {
    renderApp("/", fx.operator);
    expect(await screen.findByRole("heading", { name: "City overview" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /traffic has a second layer/i })).not.toBeInTheDocument();
  });

  it("does not flash the landing page at a signed-in user while their session is checked", async () => {
    let resolve!: (u: User) => void;
    vi.mocked(endpoints.fetchMe).mockReturnValue(new Promise<User>((r) => { resolve = r; }));
    localStorage.setItem("flowsense.token", "test-token");
    render(<MemoryRouter initialEntries={["/"]}><AuthProvider><TrafficStreamProvider enabled={false}><App /></TrafficStreamProvider></AuthProvider></MemoryRouter>);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument(); // neutral dark canvas, no landing yet
    resolve(fx.operator);
    expect(await screen.findByRole("heading", { name: "City overview" }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("/welcome always shows the landing page, even when signed in", async () => {
    renderApp("/welcome", fx.operator);
    expect(await screen.findByRole("heading", { level: 1, name: /traffic has a second layer/i }, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("routing: the app", () => {
  it("serves the dashboard at /dashboard for visitors (browsing is open)", async () => {
    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "City overview" })).toBeInTheDocument();
  });

  it("the sidebar's Dashboard link points at /dashboard and is marked current there", async () => {
    expect(NAV[0]).toMatchObject({ label: "Dashboard", to: "/dashboard", end: true });
    renderApp("/dashboard");
    const nav = await screen.findByRole("navigation", { name: /main/i });
    await waitFor(() => expect(nav.querySelector('a[aria-current="page"]')).toHaveTextContent("Dashboard"));
  });

  it("keeps every other page where it was", async () => {
    expect(NAV.slice(1).map((n) => n.to)).toEqual(["/traffic", "/predictions", "/signals", "/emergency", "/accidents", "/incidents", "/settings"]);
  });

  it("offers a way back to the project overview", async () => {
    renderApp("/dashboard");
    expect(await screen.findByRole("link", { name: /project overview/i })).toHaveAttribute("href", "/welcome");
  });

  it("an unknown address gets a 404 that links back to the dashboard", async () => {
    renderApp("/no-such-page");
    expect(await screen.findByRole("link", { name: /back to the dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
