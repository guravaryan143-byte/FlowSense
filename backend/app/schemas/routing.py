from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel

VehicleType = Literal["ambulance", "fire_service"]


class EmergencyVehicleOut(ORMModel):
    id: int
    unit_name: str
    vehicle_type: VehicleType
    current_intersection_id: int
    status: str


class RouteRequest(BaseModel):
    vehicle_id: int | None = None
    vehicle_type: VehicleType | None = None
    origin_intersection_id: int | None = None
    destination_intersection_id: int
    algorithm: Literal["astar", "dijkstra"] = "astar"
    objective: Literal["fastest", "shortest"] = "fastest"
    include_alternative: bool = True

    @model_validator(mode="after")
    def _need_vehicle_or_type(self):
        if self.vehicle_id is None and self.vehicle_type is None:
            raise ValueError("Provide vehicle_id or vehicle_type")
        if self.vehicle_id is None and self.origin_intersection_id is None:
            raise ValueError("Provide origin_intersection_id when no vehicle_id is given")
        return self


class RouteNode(BaseModel):
    id: int
    name: str
    lat: float
    lon: float


class RouteRoad(BaseModel):
    id: int
    name: str
    length_m: float
    time_s: float
    congestion_level: str


class PlannedRoute(BaseModel):
    nodes: list[RouteNode]
    roads: list[RouteRoad]
    geometry: list[list[float]]
    distance_m: float
    time_s: float
    nodes_expanded: int
    algorithm: str
    objective: str


class RouteComparison(BaseModel):
    fastest_time_s: float
    fastest_distance_m: float
    shortest_time_s: float
    shortest_distance_m: float
    same_route: bool
    time_saved_by_fastest_s: float


class RouteOut(BaseModel):
    id: int
    status: str
    vehicle_id: int | None
    vehicle_type: VehicleType
    origin_intersection_id: int
    destination_intersection_id: int
    algorithm: str
    objective: str
    route: PlannedRoute | None
    alternative: PlannedRoute | None
    comparison: RouteComparison | None
    reroute_count: int
    note: str | None = None
    data_source: str = "simulated"
    created_at: datetime
    updated_at: datetime


class RecalcOut(BaseModel):
    route: RouteOut
    changed: bool
    previous_time_s: float
    new_time_s: float | None
