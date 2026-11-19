from datetime import datetime

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow

LEVELS = ("free_flow", "moderate", "heavy", "severe")


class TrafficRecord(Base):
    __tablename__ = "traffic_records"
    __table_args__ = (
        UniqueConstraint("road_id", "recorded_at", name="road_time"),
        Index("ix_traffic_records_recorded_at", "recorded_at"),
        CheckConstraint("vehicle_count >= 0", name="count_nonneg"),
        CheckConstraint("average_speed >= 0", name="speed_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    road_id: Mapped[int] = mapped_column(ForeignKey("roads.id", ondelete="CASCADE"), index=True)
    vehicle_count: Mapped[int] = mapped_column(Integer)
    average_speed: Mapped[float] = mapped_column(Float)  # km/h
    density: Mapped[float] = mapped_column(Float)  # vehicles per km per lane
    congestion_level: Mapped[str] = mapped_column(String(20))
    data_source: Mapped[str] = mapped_column(String(20), default="simulated")
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)


class TrafficPrediction(Base):
    __tablename__ = "traffic_predictions"
    __table_args__ = (Index("ix_traffic_predictions_road_predicted", "road_id", "predicted_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    road_id: Mapped[int] = mapped_column(ForeignKey("roads.id", ondelete="CASCADE"))
    predicted_density: Mapped[float] = mapped_column(Float)
    predicted_speed: Mapped[float] = mapped_column(Float)
    congestion_level: Mapped[str] = mapped_column(String(20))
    horizon_minutes: Mapped[int] = mapped_column(Integer)
    target_time: Mapped[datetime] = mapped_column(UTCDateTime)
    model_version: Mapped[str] = mapped_column(String(40))
    predicted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
