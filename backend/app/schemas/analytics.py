from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AnalyticsOverview(BaseModel):
    data_source: str
    as_of: datetime | None
    roads_total: int
    roads_closed: int
    total_vehicles: int
    average_speed: float
    average_density: float
    congested_roads: int
    congestion_distribution: dict[str, int]
    active_incidents: int
    prediction: dict[str, Any]
    emergency: dict[str, Any]
    signal_performance: dict[str, Any]
    simulation: dict[str, Any]


class TrendPoint(BaseModel):
    time: datetime
    average_speed: float
    average_density: float
    total_vehicles: int
    congested_roads: int


class HourlyPoint(BaseModel):
    hour: int
    average_density: float
    average_speed: float


class TrendsOut(BaseModel):
    data_source: str
    hours: int
    series: list[TrendPoint]
    hourly_pattern: list[HourlyPoint]
    comparison: dict[str, list[HourlyPoint]]
