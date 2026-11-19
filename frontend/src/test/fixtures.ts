/** Typed access to REAL API responses captured by backend/scripts/capture_frontend_fixtures.py. */
import accidentAnalytics from "./fixtures/accidentAnalytics.json";
import accidents from "./fixtures/accidents.json";
import history from "./fixtures/history.json";
import hotspots from "./fixtures/hotspots.json";
import incidents from "./fixtures/incidents.json";
import intersections from "./fixtures/intersections.json";
import live from "./fixtures/live.json";
import modelInfo from "./fixtures/modelInfo.json";
import optimize from "./fixtures/optimize.json";
import overview from "./fixtures/overview.json";
import predictionOverview from "./fixtures/predictionOverview.json";
import roads from "./fixtures/roads.json";
import route from "./fixtures/route.json";
import signalDetail from "./fixtures/signalDetail.json";
import signals from "./fixtures/signals.json";
import trends from "./fixtures/trends.json";
import userOperator from "./fixtures/user_operator.json";
import userViewer from "./fixtures/user_viewer.json";
import vehicles from "./fixtures/vehicles.json";
import type {
  Accident, AccidentAnalytics, EmergencyRoute, EmergencyVehicle, HistoryPoint, HotspotsResult, Incident, Intersection, LiveTraffic,
  ModelInfo, OptimizeResult, Overview, Page, PredictionOverview, Road, Signal, SignalDetail, TrendsResult, User,
} from "../types";

const as = <T,>(v: unknown) => v as T;
export const fx = {
  roads: as<Road[]>(roads), intersections: as<Intersection[]>(intersections), live: as<LiveTraffic>(live),
  history: as<Page<HistoryPoint>>(history), overview: as<Overview>(overview), trends: as<TrendsResult>(trends),
  predictionOverview: as<PredictionOverview>(predictionOverview),
  modelInfo: as<{ available: boolean; message: string | null; info: ModelInfo | null }>(modelInfo),
  signals: as<Signal[]>(signals), signalDetail: as<SignalDetail>(signalDetail), optimize: as<OptimizeResult>(optimize),
  vehicles: as<EmergencyVehicle[]>(vehicles), route: as<EmergencyRoute>(route), hotspots: as<HotspotsResult>(hotspots),
  accidentAnalytics: as<AccidentAnalytics>(accidentAnalytics), accidents: as<Page<Accident>>(accidents),
  incidents: as<Page<Incident>>(incidents), operator: as<User>(userOperator), viewer: as<User>(userViewer),
  admin: { ...as<User>(userOperator), id: 99, name: "Demo Admin", email: "admin@flowsense.demo", role: "admin" } as User,
};
