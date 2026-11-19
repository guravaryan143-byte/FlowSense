import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { apiError, renderWithProviders } from "../test/helpers";
import Login from "./Login";

vi.mock("../services/endpoints");
const app = <Routes><Route path="/" element={<p>dashboard home</p>} /><Route path="/login" element={<Login />} /></Routes>;
beforeEach(() => vi.resetAllMocks());

describe("Login page", () => {
  it("signs in, stores the token and returns to the dashboard", async () => {
    vi.mocked(endpoints.login).mockResolvedValue({ access_token: "jwt-123", token_type: "bearer", user: fx.operator });
    renderWithProviders(app, { route: "/login" });
    await userEvent.type(screen.getByLabelText("Email"), "operator@flowsense.demo");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
    expect(endpoints.login).toHaveBeenCalledWith("operator@flowsense.demo", "secret-pass");
    expect(localStorage.getItem("flowsense.token")).toBe("jwt-123");
  });
  it("shows the server's message when credentials are wrong and stays on the page", async () => {
    vi.mocked(endpoints.login).mockRejectedValue(await apiError(401, "Invalid email or password"));
    renderWithProviders(app, { route: "/login" });
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co"); await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(localStorage.getItem("flowsense.token")).toBeNull();
  });
  it("creates an account and then signs in", async () => {
    vi.mocked(endpoints.register).mockResolvedValue(fx.viewer);
    vi.mocked(endpoints.login).mockResolvedValue({ access_token: "jwt-new", token_type: "bearer", user: fx.viewer });
    renderWithProviders(app, { route: "/login" });
    await userEvent.click(screen.getByRole("tab", { name: /create account/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Asha Rao"); await userEvent.type(screen.getByLabelText("Email"), "asha@example.com"); await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
    expect(endpoints.register).toHaveBeenCalledWith("Asha Rao", "asha@example.com", "long-enough-pass");
  });
  it("reports validation errors from the server without crashing", async () => {
    vi.mocked(endpoints.register).mockRejectedValue(await apiError(409, "An account with this email already exists"));
    renderWithProviders(app, { route: "/login" });
    await userEvent.click(screen.getByRole("tab", { name: /create account/i }));
    await userEvent.type(screen.getByLabelText("Name"), "X"); await userEvent.type(screen.getByLabelText("Email"), "dup@example.com"); await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/);
  });
  it("redirects an already signed-in user away from the login page", async () => {
    renderWithProviders(app, { route: "/login", user: fx.operator });
    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
  });
});
