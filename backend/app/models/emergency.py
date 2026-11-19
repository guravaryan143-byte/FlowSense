from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow

VEHICLE_TYPES = ("ambulance", "fire_service")


class EmergencyVehicle(Base):
    __tablename__ = "emergency_vehicles"
    __table_args__ = (
        CheckConstraint("vehicle_type IN ('ambulance','fire_service')", name="type_valid"),
        CheckConstraint("status IN ('available','dispatched','offline')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_name: Mapped[str] = mapped_column(String(60), unique=True)
    vehicle_type: Mapped[str] = mapped_column(String(20))
    current_intersection_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"))
    status: Mapped[str] = mapped_column(String(20), default="available")


class EmergencyRoute(Base):
    __tablename__ = "emergency_routes"
    __table_args__ = (
        CheckConstraint("status IN ('active','rerouted','completed','cancelled')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("emergency_vehicles.id", ondelete="SET NULL"), nullable=True)
    vehicle_type: Mapped[str] = mapped_column(String(20))
    origin_intersection_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"))
    destination_intersection_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"))
    algorithm: Mapped[str] = mapped_column(String(20))
    objective: Mapped[str] = mapped_column(String(20))
    # Full response payload: nodes, road ids, geometry, alternative, comparison
    route_data: Mapped[dict] = mapped_column(JSON)
    distance_m: Mapped[float] = mapped_column(Float)
    estimated_time_s: Mapped[float] = mapped_column(Float)
    reroute_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
