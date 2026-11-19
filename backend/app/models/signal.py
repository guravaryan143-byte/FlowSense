from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow


class TrafficSignal(Base):
    __tablename__ = "traffic_signals"
    __table_args__ = (
        CheckConstraint("mode IN ('fixed','adaptive')", name="mode_valid"),
        CheckConstraint("status IN ('operational','flashing','offline')", name="status_valid"),
        CheckConstraint("current_phase IN ('NS','EW')", name="phase_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    intersection_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"), unique=True)
    current_phase: Mapped[str] = mapped_column(String(2), default="NS")
    ns_green_s: Mapped[float] = mapped_column(Float)
    ew_green_s: Mapped[float] = mapped_column(Float)
    cycle_s: Mapped[float] = mapped_column(Float, default=90.0)
    mode: Mapped[str] = mapped_column(String(20), default="fixed")
    status: Mapped[str] = mapped_column(String(20), default="operational")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    @property
    def green_duration(self) -> float:
        """Green time of the phase that is currently active (spec field)."""
        return self.ns_green_s if self.current_phase == "NS" else self.ew_green_s


class SignalOptimizationRun(Base):
    """A measured fixed-vs-adaptive comparison. Dashboard numbers come from these rows."""

    __tablename__ = "signal_optimization_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    intersection_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"), index=True)
    scenario: Mapped[str] = mapped_column(String(20))
    duration_s: Mapped[int] = mapped_column(Integer)
    seed: Mapped[int] = mapped_column(Integer)
    applied: Mapped[bool] = mapped_column(default=False)
    fixed_timing: Mapped[dict] = mapped_column(JSON)
    adaptive_timing: Mapped[dict] = mapped_column(JSON)
    fixed_metrics: Mapped[dict] = mapped_column(JSON)
    adaptive_metrics: Mapped[dict] = mapped_column(JSON)
    improvement: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
