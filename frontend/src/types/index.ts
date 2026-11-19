/** Friendly names for the types GENERATED from the backend OpenAPI contract (npm run gen:api). */
import type { components } from "./api";

type S = components["schemas"];

export type Road = S["RoadOut"];
export type Intersection = S["IntersectionOut"];
export type RoadTraffic = S["RoadTrafficOut"];
export type LiveTraffic = S["LiveTrafficOut"];
export type TrafficSummary = S["TrafficSummary"];
export type HistoryPoint = S["HistoryPoint"];
export type Prediction = S["PredictionOut"];
export type PredictionOverview = S["PredictionOverviewOut"];
export type RoadPrediction = S["RoadPredictionOut"];
export type StoredPrediction = S["StoredPredictionOut"];
export type Signal = S["SignalOut"];
export type SignalDetail = S["SignalDetailOut"];
export type OptimizeRequest = S["OptimizeRequest"];
export type OptimizeResult = S["OptimizeOut"];
export type SimMetrics = S["SimMetrics"];
export type Approach = S["ApproachOut"];
export type EmergencyVehicle = S["EmergencyVehicleOut"];
export type RouteRequest = S["RouteRequest"];
export type EmergencyRoute = S["RouteOut"];
export type PlannedRoute = S["PlannedRoute"];
export type RecalcResult = S["RecalcOut"];
export type Accident = S["AccidentOut"];
export type Hotspot = S["Hotspot"];
export type HotspotsResult = S["HotspotsOut"];
export type AccidentAnalytics = S["AccidentAnalyticsOut"];
export type Incident = S["IncidentOut"];
export type IncidentCreate = S["IncidentCreate"];
export type IncidentUpdate = S["IncidentUpdate"];
export type CloseRoadResult = S["CloseRoadOut"];
export type TrendsResult = S["TrendsOut"];
export type HourlyPoint = S["HourlyPoint"];
export type User = S["UserOut"];
export type TokenResult = S["TokenOut"];
export type SimulationStatus = S["SimulationStatusOut"];
export type SimulationStart = S["SimulationStartIn"];

export type CongestionLevel = RoadTraffic["congestion_level"]; // free_flow | moderate | heavy | severe | closed
export type Severity = Incident["severity"];
export type IncidentStatus = Incident["status"];
export type IncidentType = Incident["incident_type"];
export type Role = User["role"];
export type Scenario = OptimizeRequest["scenario"];

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// The backend types these four blocks as free-form objects; this is their documented shape.
export interface PredictionBrief { model_available: boolean; horizon_minutes: number | null; predicted_congested_roads: number | null }
export interface EmergencyBrief {
  active_routes: number; routes_planned: number; average_eta_s: number | null;
  last_route: { id: number; vehicle_type: string; estimated_time_s: number; distance_m: number; status: string } | null;
}
export interface SignalBrief {
  runs: number; average_wait_reduction_pct: number | null; note: string;
  last_run: { intersection_id: number; scenario: string; improvement: { wait_reduction_pct: number | null; verdict: string }; created_at: string } | null;
}
export type Overview = Omit<S["AnalyticsOverview"], "prediction" | "emergency" | "signal_performance" | "simulation"> & {
  prediction: PredictionBrief; emergency: EmergencyBrief; signal_performance: SignalBrief; simulation: SimulationStatus;
};

export interface ModelMetrics { mae: number; rmse: number; r2: number }
export interface ModelInfo {
  version: string; trained_at: string; horizon_minutes: number; n_train: number; n_test: number; split_time: string;
  data_source: string; n_estimators: number;
  metrics: Record<string, { target_density: ModelMetrics; target_speed: ModelMetrics }>;
  feature_importances: Record<string, number>;
  density_mae_improvement_vs_persistence_pct: number | null;
}

// ---- WebSocket messages -------------------------------------------------------------------
export interface StreamRoad {
  road_id: number; vehicle_count: number; average_speed: number; density: number; occupancy: number;
  congestion_level: CongestionLevel; is_closed: boolean;
}
export interface StreamSignal { intersection_id: number; current_phase: "NS" | "EW"; ns_green_s: number; ew_green_s: number; mode: string }
export type StreamMessage =
  | { type: "snapshot"; roads: RoadTraffic[] }
  | ({ type: "status" } & SimulationStatus)
  | { type: "traffic_update"; tick: number; sim_time: string; data_source: string; roads: StreamRoad[]; signals: StreamSignal[];
      summary: { total_vehicles: number; average_speed: number; average_density: number; congested_roads: number } };
