from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

Scenario = Literal["live", "balanced", "ns_heavy", "shifting"]


class Timing(BaseModel):
    ns_green_s: float
    ew_green_s: float
    cycle_s: float


class ApproachOut(BaseModel):
    road_id: int
    road_name: str
    phase: Literal["NS", "EW"]
    vehicle_count: int
    occupancy: float
    estimated_queue: float
    is_closed: bool


class SignalOut(BaseModel):
    intersection_id: int
    intersection_name: str
    latitude: float
    longitude: float
    current_phase: Literal["NS", "EW"]
    green_duration: float
    mode: Literal["fixed", "adaptive"]
    status: str
    current: Timing
    fixed_baseline: Timing
    recommended: Timing
    total_estimated_queue: float
    pressure: dict[str, float]
    updated_at: datetime


class SimMetrics(BaseModel):
    strategy: str
    avg_wait_s: float
    throughput: int
    avg_queue: float
    max_queue: int
    final_queue: int
    vehicles_arrived: int
    queue_series: list[dict[str, float]]


class Improvement(BaseModel):
    wait_reduction_pct: float | None
    queue_reduction_pct: float | None
    throughput_change_pct: float | None
    verdict: str


class OptimizeRequest(BaseModel):
    intersection_id: int
    scenario: Scenario = "live"
    duration_s: int = Field(default=3600, ge=300, le=14400)
    seed: int = Field(default=42, ge=0, le=2**31 - 1)
    apply: bool = Field(default=False, description="Apply the recommended timing to the live signal (operator+)")


class OptimizeOut(BaseModel):
    run_id: int
    intersection_id: int
    intersection_name: str
    scenario: Scenario
    duration_s: int
    seed: int
    applied: bool
    approaches: list[ApproachOut]
    fixed_timing: Timing
    adaptive_timing: Timing
    fixed: SimMetrics
    adaptive: SimMetrics
    improvement: Improvement
    notice: str
    created_at: datetime


class SignalDetailOut(SignalOut):
    approaches: list[ApproachOut]
    last_run: "RunSummary | None" = None


class RunSummary(ORMModel):
    id: int
    scenario: str
    duration_s: int
    applied: bool
    improvement: dict
    created_at: datetime


SignalDetailOut.model_rebuild()
