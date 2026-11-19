from datetime import datetime

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime


class AccidentRecord(Base):
    __tablename__ = "accident_records"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical')", name="severity_valid"),
        Index("ix_accident_records_occurred_at", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    road_id: Mapped[int | None] = mapped_column(ForeignKey("roads.id", ondelete="SET NULL"), nullable=True, index=True)
    accident_type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
    data_source: Mapped[str] = mapped_column(String(20), default="simulated")
