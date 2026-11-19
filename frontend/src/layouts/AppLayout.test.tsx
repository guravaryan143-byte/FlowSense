import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { fx } from "../test/fixtures";
import { renderWithProviders } from "../test/helpers";
import { AppLayout, NAV } from "./AppLayout";

vi.mock("../services/endpoints");
const shell = <Routes><Route element={<AppLayout />}><Route index element={<p>home page</p>} /><Route path="traffic" element={<p>traffic page</p>} /></Route></Routes>;

describe("AppLayout", () => {
  it("offers all eight sections in the sidebar", () => {
    renderWithProviders(shell);
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const labels = ["Dashboard", "Traffic Monitoring", "AI Predictions", "Signal Optimization", "Emergency Routes", "Accident Analytics", "Incidents", "Settings"];
    expect(NAV.map((n) => n.label)).toEqual(labels);
    labels.forEach((l) => expect(nav).toHaveTextContent(l));
    expect(screen.getByRole("link", { name: /flowsense home/i })).toBeInTheDocument();
  });
  it("navigates between pages and marks the current one", async () => {
    renderWithProviders(shell);
    expect(screen.getByText("home page")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Traffic Monitoring" }));
    expect(await screen.findByText("traffic page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Traffic Monitoring" })).toHaveAttribute("aria-current", "page");
  });
  it("shows Sign in for guests and the live-stream status", () => {
    renderWithProviders(shell);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/live stream offline/i)).toBeInTheDocument();
  });
  it("shows the user and signs out", async () => {
    renderWithProviders(shell, { user: fx.operator });
    expect(await screen.findByText(fx.operator.name)).toBeInTheDocument();
    expect(screen.getByText("operator")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(localStorage.getItem("flowsense.token")).toBeNull();
  });
  it("opens and closes the mobile menu", async () => {
    renderWithProviders(shell);
    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("dialog", { name: /navigation menu/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
