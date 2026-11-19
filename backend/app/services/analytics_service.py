from __future__ import annotations

from datetime import timedelta

import pandas as pd
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailed
from app.ml.model_store import ModelStore
from app.models import EmergencyRoute, Incident, Road, SignalOptimizationRun, TrafficRecord
from app.services import prediction_service, traffic_service
from app.services.incident_service import ACTIVE_STATUSES


def overview(db: Session, store: ModelStore, sim_status: dict) -> dict:
    snap = traffic_service.live_snapshot(db)
    s = snap["summary"]
    active = db.scalar(select(func.count()).select_from(Incident).where(Incident.status.in_(ACTIVE_STATUSES))) or 0

    pred = {"model_available": store.is_available(), "horizon_minutes": None, "predicted_congested_roads": None, "summary": {}}
    if pred["model_available"]:
        po = prediction_service.overview(db, store)
        pred.update(horizon_minutes=po["horizon_minutes"], summary=po["summary"],
                    predicted_congested_roads=po["summary"].get("predicted_congested_roads"))

    live_routes = db.scalars(select(EmergencyRoute).where(EmergencyRoute.status.in_(("active", "rerouted")))).all()
    recent = db.scalars(select(EmergencyRoute).order_by(EmergencyRoute.id.desc()).limit(20)).all()
    last = recent[0] if recent else None
    emergency = {
        "active_routes": len(live_routes), "routes_planned": len(recent),
        "average_eta_s": round(sum(r.estimated_time_s for r in recent) / len(recent), 1) if recent else None,
        "last_route": None if last is None else {"id": last.id, "vehicle_type": last.vehicle_type,
                                                 "estimated_time_s": last.estimated_time_s, "distance_m": last.distance_m,
                                                 "status": last.status},
    }
    runs = db.scalars(select(SignalOptimizationRun).order_by(SignalOptimizationRun.id.desc()).limit(20)).all()
    gains = [r.improvement.get("wait_reduction_pct") for r in runs if r.improvement.get("wait_reduction_pct") is not None]
    signals = {
        "runs": len(runs),
        "average_wait_reduction_pct": round(sum(gains) / len(gains), 1) if gains else None,
        "note": "Measured in simulation; varies strongly with the demand scenario.",
        "last_run": None if not runs else {"intersection_id": runs[0].intersection_id, "scenario": runs[0].scenario,
                                           "improvement": runs[0].improvement, "created_at": runs[0].created_at.isoformat()},
    }
    return {
        "data_source": "simulated", "as_of": s["as_of"], "roads_total": s["road_count"],
        "roads_closed": s["road_count"] - s["open_roads"], "total_vehicles": s["total_vehicles"],
        "average_speed": s["average_speed"], "average_density": s["average_density"], "congested_roads": s["congested_roads"],
        "congestion_distribution": s["level_counts"], "active_incidents": active, "prediction": pred,
        "emergency": emergency, "signal_performance": signals, "simulation": sim_status,
    }


def _hourly(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    g = df.groupby(df["time"].dt.hour).agg(average_density=("average_density", "mean"), average_speed=("average_speed", "mean"))
    return [{"hour": int(h), "average_density": round(float(r.average_density), 2), "average_speed": round(float(r.average_speed), 1)}
            for h, r in g.iterrows()]


def traffic_trends(db: Session, hours: int) -> dict:
    if not 1 <= hours <= 168:
        raise ValidationFailed("hours must be between 1 and 168")
    end = db.scalar(select(func.max(TrafficRecord.recorded_at)))
    if end is None:
        return {"data_source": "simulated", "hours": hours, "series": [], "hourly_pattern": [], "comparison": {"current": [], "previous_week": []}}
    since = end - timedelta(days=8)
    congested = func.sum(case((TrafficRecord.congestion_level.in_(("heavy", "severe")), 1), else_=0))
    rows = db.execute(
        select(TrafficRecord.recorded_at, func.avg(TrafficRecord.average_speed), func.avg(TrafficRecord.density),
               func.sum(TrafficRecord.vehicle_count), congested)
        .where(TrafficRecord.recorded_at > since).group_by(TrafficRecord.recorded_at).order_by(TrafficRecord.recorded_at)
    ).all()
    df = pd.DataFrame(rows, columns=["time", "average_speed", "average_density", "total_vehicles", "congested_roads"])
    df["time"] = pd.to_datetime(df["time"], utc=True)
    window = df[df["time"] > end - timedelta(hours=hours)]
    series = [{"time": r.time.to_pydatetime(), "average_speed": round(float(r.average_speed), 1),
               "average_density": round(float(r.average_density), 2), "total_vehicles": int(r.total_vehicles),
               "congested_roads": int(r.congested_roads)} for r in window.itertuples()]
    week = df[df["time"] > end - timedelta(days=7)]
    prev = df[(df["time"] > end - timedelta(days=8)) & (df["time"] <= end - timedelta(days=7))]
    return {"data_source": "simulated", "hours": hours, "series": series, "hourly_pattern": _hourly(week),
            "comparison": {"current": _hourly(df[df["time"] > end - timedelta(hours=24)]), "previous_week": _hourly(prev)}}
