from typing import Literal

from pydantic import BaseModel, Field


class SimulationStartIn(BaseModel):
    tick_interval_s: float | None = Field(default=None, ge=0.2, le=60)
    minutes_per_tick: float | None = Field(default=None, ge=1, le=15)
    signal_mode: Literal["fixed", "adaptive"] = "fixed"
    demand_multiplier: float = Field(default=1.0, ge=0.2, le=1.6)
    seed: int = 42


class SimulationStatusOut(BaseModel):
    running: bool
    data_source: str = "simulated"
    tick: int
    sim_time: str | None
    signal_mode: str | None
    tick_interval_s: float | None
    minutes_per_tick: float | None
    demand_multiplier: float | None
    connected_clients: int
    last_error: str | None = None
