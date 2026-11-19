from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow

ROAD_TYPES = ("local", "collector", "arterial")


class Intersection(Base):
    __tablename__ = "intersections"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)


class Road(Base):
    __tablename__ = "roads"
    __table_args__ = (
        CheckConstraint("start_node_id <> end_node_id", name="distinct_nodes"),
        CheckConstraint("length_m > 0", name="length_positive"),
        CheckConstraint("lanes >= 1", name="lanes_positive"),
        CheckConstraint("road_type IN ('local','collector','arterial')", name="road_type_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    road_name: Mapped[str] = mapped_column(String(120), unique=True)
    start_node_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"), index=True)
    end_node_id: Mapped[int] = mapped_column(ForeignKey("intersections.id"), index=True)
    length_m: Mapped[float] = mapped_column(Float)
    lanes: Mapped[int] = mapped_column(Integer, default=2)
    speed_limit_kmh: Mapped[float] = mapped_column(Float, default=40.0)
    road_type: Mapped[str] = mapped_column(String(20), default="collector")
    # Vehicles on the road at jam density (see services/traffic_metrics.py)
    capacity: Mapped[int] = mapped_column(Integer)
    # [[lat, lon], ...] polyline from start node to end node
    geometry: Mapped[list] = mapped_column(JSON)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
