from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import CongestionLevel, ORMModel


class PredictionRequest(BaseModel):
    road_ids: list[int] | None = Field(default=None, description="Roads to predict; omit for all roads")
    persist: bool = True


class PredictionOut(BaseModel):
    road_id: int
    road_name: str
    current_density: float
    current_speed: float
    current_level: CongestionLevel
    predicted_density: float
    predicted_speed: float
    predicted_occupancy: float
    congestion_level: CongestionLevel
    horizon_minutes: int
    target_time: datetime
    predicted_at: datetime
    model_version: str


class PredictionOverviewOut(BaseModel):
    model_available: bool
    message: str | None = None
    horizon_minutes: int | None = None
    summary: dict[str, int] = {}
    predictions: list[PredictionOut] = []


class StoredPredictionOut(ORMModel):
    id: int
    road_id: int
    predicted_density: float
    predicted_speed: float
    congestion_level: CongestionLevel
    horizon_minutes: int
    target_time: datetime
    predicted_at: datetime
    model_version: str


class RoadPredictionOut(BaseModel):
    road_id: int
    model_available: bool
    latest: PredictionOut | None = None
    history: list[StoredPredictionOut] = []


class ModelInfoOut(BaseModel):
    available: bool
    message: str | None = None
    info: dict[str, Any] | None = None
