"""Traffic reads: live snapshot, single road, history. Also the congestion helpers used everywhere."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models import Road, TrafficRecord
from app.simulation.engine import classify_occupancy

SIM_NOTICE = ("SIMULATED DATA: produced by FlowSense's Python traffic simulator on a fictional road network. "
              "This is not real-world live traffic.")


def level_for(record: TrafficRecord | None, road: Road) -> str:
    if road.is_closed:
        return "closed"
    return record.congestion_level if record else "free_flow"


def latest_records(db: Session) -> dict[int, TrafficRecord]:
    """Most recent record per road (portable SQL: max-per-group joined back)."""
    newest = select(TrafficRecord.road_id, func.max(TrafficRecord.recorded_at).label("t")).group_by(TrafficRecord.road_id).subquery()
    q = select(TrafficRecord).join(newest, and_(TrafficRecord.road_id == newest.c.road_id, TrafficRecord.recorded_at == newest.c.t))
    return {r.road_id: r for r in db.scalars(q)}


def road_traffic_dict(road: Road, rec: TrafficRecord | None) -> dict:
    return {
        "road_id": road.id,
        "road_name": road.road_name,
        "road_type": road.road_type,
        "vehicle_count": rec.vehicle_count if rec else 0,
        "average_speed": rec.average_speed if rec else road.speed_limit_kmh,
        "density": rec.density if rec else 0.0,
        "occupancy": round(rec.vehicle_count / road.capacity, 4) if rec else 0.0,
        "congestion_level": level_for(rec, road),
        "is_closed": road.is_closed,
        "recorded_at": rec.recorded_at if rec else None,
        "data_source": rec.data_source if rec else "simulated",
    }


def summarise(rows: list[dict]) -> dict:
    open_rows = [r for r in rows if not r["is_closed"]]
    levels = {k: 0 for k in ("free_flow", "moderate", "heavy", "severe", "closed")}
    for r in rows:
        levels[r["congestion_level"]] += 1
    n = len(open_rows) or 1
    stamps = [r["recorded_at"] for r in rows if r["recorded_at"]]
    return {
        "total_vehicles": sum(r["vehicle_count"] for r in open_rows),
        "road_count": len(rows),
        "open_roads": len(open_rows),
        "average_speed": round(sum(r["average_speed"] for r in open_rows) / n, 1),
        "average_density": round(sum(r["density"] for r in open_rows) / n, 2),
        "congested_roads": levels["heavy"] + levels["severe"],
        "level_counts": levels,
        "as_of": max(stamps) if stamps else None,
    }


def live_snapshot(db: Session) -> dict:
    roads = list(db.scalars(select(Road).order_by(Road.id)))
    latest = latest_records(db)
    rows = [road_traffic_dict(r, latest.get(r.id)) for r in roads]
    return {"data_source": "simulated", "notice": SIM_NOTICE, "summary": summarise(rows), "roads": rows}


def get_road(db: Session, road_id: int) -> Road:
    road = db.get(Road, road_id)
    if road is None:
        raise NotFoundError(f"Road {road_id} not found")
    return road


def road_traffic(db: Session, road_id: int) -> dict:
    road = get_road(db, road_id)
    rec = db.scalars(select(TrafficRecord).where(TrafficRecord.road_id == road_id)
                     .order_by(TrafficRecord.recorded_at.desc()).limit(1)).first()
    return road_traffic_dict(road, rec)


def road_history(db: Session, road_id: int, hours: int = 24, limit: int = 500, offset: int = 0) -> dict:
    """History window ends at the road's latest record (the simulated clock may differ from wall-clock time)."""
    road = get_road(db, road_id)
    end = db.scalar(select(func.max(TrafficRecord.recorded_at)).where(TrafficRecord.road_id == road_id))
    if end is None:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    where = and_(TrafficRecord.road_id == road_id, TrafficRecord.recorded_at > end - timedelta(hours=hours))
    total = db.scalar(select(func.count()).select_from(TrafficRecord).where(where)) or 0
    rows = db.scalars(select(TrafficRecord).where(where).order_by(TrafficRecord.recorded_at).limit(limit).offset(offset))
    items = [{"recorded_at": r.recorded_at, "vehicle_count": r.vehicle_count, "average_speed": r.average_speed,
              "density": r.density, "congestion_level": r.congestion_level}
             for r in rows]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def make_record(road: Road, vehicle_count: int, average_speed: float, recorded_at, density: float | None = None) -> TrafficRecord:
    """Build a TrafficRecord, deriving density and congestion level in ONE place."""
    if density is None:
        density = vehicle_count / ((road.length_m / 1000.0) * road.lanes)
    return TrafficRecord(road_id=road.id, vehicle_count=vehicle_count, average_speed=average_speed,
                         density=round(density, 2), congestion_level=classify_occupancy(vehicle_count / road.capacity),
                         recorded_at=recorded_at, data_source="simulated")
