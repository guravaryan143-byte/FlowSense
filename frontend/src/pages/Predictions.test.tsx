import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "../services/endpoints";
import { fx } from "../test/fixtures";
import { apiError, mockReadApi, renderWithProviders } from "../test/helpers";
import Predictions from "./Predictions";

vi.mock("../services/endpoints");
vi.mock("../maps/TrafficMap", async () => await import("../test/mockMap"));
vi.mock("../charts/charts", async () => await import("../test/mockCharts"));
beforeEach(() => { vi.resetAllMocks(); mockReadApi(); });

describe("Predictions", () => {
  it("explains how to train when there is no model (graceful, not broken)", async () => {
    vi.mocked(endpoints.getPredictionOverview).mockResolvedValue({ model_available: false, message: "Model not trained yet. Run: python -m app.ml.train", horizon_minutes: null, summary: {}, predictions: [] });
    vi.mocked(endpoints.getModelInfo).mockResolvedValue({ available: false, message: "Model not trained yet.", info: null });
    renderWithProviders(<Predictions />);
    expect(await screen.findByText(/has not been trained yet/i)).toBeInTheDocument();
    expect(screen.getByText(/python -m app.ml.train/)).toBeInTheDocument();
    expect(screen.getByText("No evaluation available")).toBeInTheDocument();
  });

  it("lists a forecast for every road with current and predicted levels", async () => {
    renderWithProviders(<Predictions />);
    const table = (await screen.findAllByRole("table"))[0];
    expect(within(table).getAllByRole("row").length - 1).toBe(fx.predictionOverview.predictions.length);
    expect(await screen.findByText(new RegExp(`next ${fx.predictionOverview.horizon_minutes} minutes`))).toBeInTheDocument();
    expect(screen.getByTestId("compare-chart")).toHaveAttribute("data-points", "12");
  });

  it("shows the REAL evaluation metrics, both baselines, and the simulated-data caveat", async () => {
    renderWithProviders(<Predictions />);
    const info = fx.modelInfo.info!;
    expect(await screen.findByText("Random Forest")).toBeInTheDocument();
    expect(screen.getByText("Baseline: no change")).toBeInTheDocument();
    expect(screen.getByText("Baseline: historical average")).toBeInTheDocument();
    expect(screen.getAllByText(info.metrics.random_forest.target_density.mae.toFixed(3)).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a claim about real-world accuracy/i)).toBeInTheDocument();
    expect(screen.getByTestId("bars-chart")).toHaveTextContent(Object.keys(info.feature_importances)[0]);
  });

  it("loads saved predictions when a road is clicked", async () => {
    renderWithProviders(<Predictions />);
    const table = (await screen.findAllByRole("table"))[0];
    await userEvent.click(within(table).getAllByRole("row")[1]);
    expect(endpoints.getRoadPrediction).toHaveBeenCalledWith(fx.predictionOverview.predictions.sort((a, b) => b.predicted_density - a.predicted_density)[0].road_id);
    expect(await screen.findByText(/no saved predictions for this road/i)).toBeInTheDocument();
  });

  it("asks guests to sign in before saving a prediction run", async () => {
    renderWithProviders(<Predictions />);
    expect(await screen.findByTestId("role-gate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run & save/i })).toBeNull();
  });

  it("lets a signed-in user save predictions and reports the count", async () => {
    vi.mocked(endpoints.runPredictions).mockResolvedValue(fx.predictionOverview.predictions);
    renderWithProviders(<Predictions />, { user: fx.viewer });
    await userEvent.click(await screen.findByRole("button", { name: /run & save predictions/i }));
    expect(endpoints.runPredictions).toHaveBeenCalledWith(undefined, true);
    expect(await screen.findByRole("status")).toHaveTextContent(`Saved ${fx.predictionOverview.predictions.length} predictions`);
  });

  it("shows the server's message if saving fails", async () => {
    vi.mocked(endpoints.runPredictions).mockRejectedValue(await apiError(503, "The congestion model has not been trained yet."));
    renderWithProviders(<Predictions />, { user: fx.viewer });
    await userEvent.click(await screen.findByRole("button", { name: /run & save predictions/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not been trained/);
  });
});
