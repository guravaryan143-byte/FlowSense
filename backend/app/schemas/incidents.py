import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel, Severity

IncidentType = Literal["accident", "breakdown", "road_work", "flooding", "event", "hazard", "other"]
IncidentStatus = Literal["reported", "verified", "in_progress", "resolved"]
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(v: str) -> str:
    return _CONTROL.sub("", v).strip()


class IncidentCreate(BaseModel):
    road_id: int | None = None
    incident_type: IncidentType
    severity: Severity
    description: str = Field(default="", max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    _clean = field_validator("description")(_clean_text)

    @model_validator(mode="after")
    def _need_location(self):
        if self.road_id is None and (self.latitude is None or self.longitude is None):
            raise ValueError("Provide road_id, or both latitude and longitude")
        return self


class IncidentUpdate(BaseModel):
    status: IncidentStatus | None = None
    severity: Severity | None = None
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("description")
    @classmethod
    def _clean(cls, v):
        return None if v is None else _clean_text(v)


class IncidentOut(ORMModel):
    id: int
    road_id: int | None
    road_name: str | None = None
    incident_type: IncidentType
    severity: Severity
    description: str
    latitude: float
    longitude: float
    status: IncidentStatus
    closes_road: bool
    reported_by: int | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None


class CloseRoadOut(BaseModel):
    incident: IncidentOut
    road_id: int
    rerouted_route_ids: list[int]
    cancelled_route_ids: list[int]
    message: str
