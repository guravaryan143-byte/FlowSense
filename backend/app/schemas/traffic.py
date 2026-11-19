from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import DataSource, ORMModel, RoadLevel


class IntersectionOut(ORMModel):
    id: int
    name: str
    latitude: float
    longitude: float


class RoadOut(ORMModel):
    id: int
    road_name: str
    start_node_id: int
    end_node_id: int
    length_m: float
    lanes: int
    speed_limit_kmh: float
    road_type: str
    capacity: int
    geometry: list[list[float]]
    is_closed: bool


class RoadTrafficOut(BaseModel):
    road_id: int
    road_name: str
    road_type: str
    vehicle_count: int
    average_speed: float
    density: float  # vehicles / km / lane
    occupancy: float  # vehicle_count / capacity (0..1)
    congestion_level: RoadLevel
    is_closed: bool
    recorded_at: datetime | None
    data_source: DataSource = "simulated"


class TrafficSummary(BaseModel):
    total_vehicles: int
    road_count: int
    open_roads: int
    average_speed: float
    average_density: float
    congested_roads: int  # heavy + severe
    level_counts: dict[str, int]
    as_of: datetime | None


class LiveTrafficOut(BaseModel):
    data_source: DataSource
    notice: str
    summary: TrafficSummary
    roads: list[RoadTrafficOut]


class HistoryPoint(BaseModel):
    recorded_at: datetime
    vehicle_count: int
    average_speed: float
    density: float
    congestion_level: RoadLevel
