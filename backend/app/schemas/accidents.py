from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, Severity


class AccidentOut(ORMModel):
    id: int
    road_id: int | None
    accident_type: str
    severity: Severity
    latitude: float
    longitude: float
    occurred_at: datetime
    data_source: str


class Hotspot(BaseModel):
    rank: int
    center_lat: float
    center_lon: float
    radius_m: float
    accident_count: int
    severity_counts: dict[str, int]
    severity_score: int
    top_accident_type: str
    accidents_per_month: float
    first_occurrence: str
    last_occurrence: str
    nearest_road: str | None = None


class HotspotsOut(BaseModel):
    eps_m: float
    min_samples: int
    accidents_analysed: int
    clustered_accidents: int
    noise_accidents: int
    hotspots: list[Hotspot]
    disclaimer: str
    data_source: str = "simulated"


class AccidentAnalyticsOut(BaseModel):
    total: int
    by_severity: dict[str, int]
    by_type: dict[str, int]
    by_hour: list[int]  # 24 values
    by_month: list[dict]
    data_source: str = "simulated"
