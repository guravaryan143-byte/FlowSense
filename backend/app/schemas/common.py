from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")
CongestionLevel = Literal["free_flow", "moderate", "heavy", "severe"]
RoadLevel = Literal["free_flow", "moderate", "heavy", "severe", "closed"]
Severity = Literal["low", "medium", "high", "critical"]
DataSource = Literal["simulated", "sensor"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ErrorOut(BaseModel):
    error: str
    message: str


UTCStamp = datetime
