from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow

SEVERITIES = ("low", "medium", "high", "critical")
INCIDENT_TYPES = ("accident", "breakdown", "road_work", "flooding", "event", "hazard", "other")
INCIDENT_STATUSES = ("reported", "verified", "in_progress", "resolved")


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical')", name="severity_valid"),
        CheckConstraint("status IN ('reported','verified','in_progress','resolved')", name="status_valid"),
        Index("ix_incidents_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    road_id: Mapped[int | None] = mapped_column(ForeignKey("roads.id", ondelete="SET NULL"), nullable=True, index=True)
    incident_type: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="reported")
    closes_road: Mapped[bool] = mapped_column(Boolean, default=False)
    reported_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
