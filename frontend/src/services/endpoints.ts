/** One typed function per backend endpoint. Components never call axios directly. */
import { api } from "./api";
import type {
  Accident, AccidentAnalytics, CloseRoadResult, EmergencyRoute, EmergencyVehicle, HistoryPoint, HotspotsResult, Incident,
  IncidentCreate, IncidentUpdate, Intersection, LiveTraffic, ModelInfo, OptimizeRequest, OptimizeResult, Overview, Page,
  Prediction, PredictionOverview, RecalcResult, Road, RoadPrediction, RoadTraffic, RouteRequest, Severity, Signal,
  SignalDetail, SimulationStart, SimulationStatus, TokenResult, TrendsResult, User, IncidentStatus, Role,
} from "../types";

const get = <T>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data);
const post = <T>(url: string, body?: object) => api.post<T>(url, body).then((r) => r.data);
const patch = <T>(url: string, body?: object) => api.patch<T>(url, body).then((r) => r.data);

// auth
export const login = (email: string, password: string) => post<TokenResult>("/api/auth/login", { email, password });
export const register = (name: string, email: string, password: string) => post<User>("/api/auth/register", { name, email, password });
export const fetchMe = () => get<User>("/api/auth/me");
export const listUsers = () => get<User[]>("/api/auth/users");
export const setUserRole = (id: number, role: Role) => patch<User>(`/api/auth/users/${id}/role`, { role });

// network + traffic
export const getRoads = () => get<Road[]>("/api/roads");
export const getIntersections = () => get<Intersection[]>("/api/intersections");
export const getLiveTraffic = () => get<LiveTraffic>("/api/traffic/live");
export const getRoadTraffic = (id: number) => get<RoadTraffic>(`/api/traffic/${id}`);
export const getRoadHistory = (id: number, hours = 24) => get<Page<HistoryPoint>>(`/api/traffic/history/${id}`, { hours, limit: 2000 });

// predictions
export const getPredictionOverview = () => get<PredictionOverview>("/api/predictions/overview");
export const getModelInfo = () => get<{ available: boolean; message: string | null; info: ModelInfo | null }>("/api/predictions/model-info");
export const getRoadPrediction = (id: number) => get<RoadPrediction>(`/api/predictions/${id}`);
export const runPredictions = (roadIds?: number[], persist = true) => post<Prediction[]>("/api/predictions", { road_ids: roadIds ?? null, persist });

// signals
export const getSignals = () => get<Signal[]>("/api/signals");
export const getSignal = (intersectionId: number) => get<SignalDetail>(`/api/signals/${intersectionId}`);
export const optimizeSignal = (req: OptimizeRequest) => post<OptimizeResult>("/api/signals/optimize", req);
export const resetSignal = (intersectionId: number) => post<SignalDetail>(`/api/signals/${intersectionId}/reset`);

// emergency routing
export const getVehicles = () => get<EmergencyVehicle[]>("/api/emergency-vehicles");
export const planRoute = (req: RouteRequest) => post<EmergencyRoute>("/api/routes/emergency", req);
export const getRoutes = (limit = 10) => get<EmergencyRoute[]>("/api/routes", { limit });
export const recalcRoute = (id: number) => post<RecalcResult>(`/api/routes/${id}/recalculate`);

// accidents
export interface AccidentFilters { date_from?: string; date_to?: string; severity?: Severity }
export const getAccidents = (f: AccidentFilters, limit = 1000) => get<Page<Accident>>("/api/accidents", { ...f, limit });
export const getHotspots = (f: AccidentFilters, eps_m: number, min_samples: number) => get<HotspotsResult>("/api/accidents/hotspots", { ...f, eps_m, min_samples });
export const getAccidentAnalytics = (f: AccidentFilters) => get<AccidentAnalytics>("/api/accidents/analytics", f);

// incidents
export interface IncidentQuery { status?: IncidentStatus; severity?: Severity; active_only?: boolean; limit?: number; offset?: number }
export const getIncidents = (q: IncidentQuery = {}) => get<Page<Incident>>("/api/incidents", q);
export const createIncident = (body: IncidentCreate) => post<Incident>("/api/incidents", body);
export const updateIncident = (id: number, body: IncidentUpdate) => patch<Incident>(`/api/incidents/${id}`, body);
export const closeRoad = (id: number) => post<CloseRoadResult>(`/api/incidents/${id}/close-road`);

// analytics + simulation
export const getOverview = () => get<Overview>("/api/analytics/overview");
export const getTrends = (hours = 24) => get<TrendsResult>("/api/analytics/traffic-trends", { hours });
export const getSimStatus = () => get<SimulationStatus>("/api/simulation/status");
export const startSim = (body: SimulationStart) => post<SimulationStatus>("/api/simulation/start", body);
export const stopSim = () => post<SimulationStatus>("/api/simulation/stop");
export const getHealth = () => get<{ status: string; database: string; model_available: boolean; simulation_running: boolean }>("/api/health");
