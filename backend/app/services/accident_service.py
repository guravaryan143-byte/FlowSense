from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.algorithms.geo import haversine_m, point_on_polyline
from app.algorithms.hotspots import AccidentPoint, find_hotspots
from app.models import AccidentRecord, Road

DISCLAIMER = ("Hotspots show where accidents were concentrated in the past. They are descriptive statistics, "
              "not proof of cause and not a prediction that an accident will happen there.")


def _filters(date_from: datetime | None, date_to: datetime | None, severity: str | None) -> list:
    conds = []
    if date_from:
        conds.append(AccidentRecord.occurred_at >= date_from)
    if date_to:
        conds.append(AccidentRecord.occurred_at <= date_to)
    if severity:
        conds.append(AccidentRecord.severity == severity)
    return conds


def list_accidents(db: Session, date_from, date_to, severity, limit: int, offset: int) -> dict:
    conds = _filters(date_from, date_to, severity)
    total = db.scalar(select(func.count()).select_from(AccidentRecord).where(*conds)) or 0
    items = list(db.scalars(select(AccidentRecord).where(*conds).order_by(AccidentRecord.occurred_at.desc())
                            .limit(limit).offset(offset)))
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def _nearest_road(db: Session, lat: float, lon: float, roads: list[Road]) -> str | None:
    best, best_d = None, float("inf")
    for r in roads:
        for i in range(11):
            plat, plon = point_on_polyline(r.geometry, i / 10)
            d = haversine_m(lat, lon, plat, plon)
            if d < best_d:
                best, best_d = r.road_name, d
    return best


def hotspots(db: Session, date_from, date_to, severity, eps_m: float, min_samples: int) -> dict:
    rows = list(db.scalars(select(AccidentRecord).where(*_filters(date_from, date_to, severity))))
    points = [AccidentPoint(a.id, a.latitude, a.longitude, a.severity, a.accident_type, a.occurred_at) for a in rows]
    clusters = find_hotspots(points, eps_m, min_samples)
    roads = list(db.scalars(select(Road)))
    for c in clusters:
        c["nearest_road"] = _nearest_road(db, c["center_lat"], c["center_lon"], roads)
        c.pop("accident_ids", None)
    clustered = sum(c["accident_count"] for c in clusters)
    return {"eps_m": eps_m, "min_samples": min_samples, "accidents_analysed": len(points), "clustered_accidents": clustered,
            "noise_accidents": len(points) - clustered, "hotspots": clusters, "disclaimer": DISCLAIMER, "data_source": "simulated"}


def analytics(db: Session, date_from, date_to, severity) -> dict:
    rows = list(db.scalars(select(AccidentRecord).where(*_filters(date_from, date_to, severity))))
    by_sev = {s: 0 for s in ("low", "medium", "high", "critical")}
    by_type: dict[str, int] = {}
    by_hour = [0] * 24
    by_month: dict[str, int] = {}
    for a in rows:
        by_sev[a.severity] += 1
        by_type[a.accident_type] = by_type.get(a.accident_type, 0) + 1
        by_hour[a.occurred_at.hour] += 1
        key = a.occurred_at.strftime("%Y-%m")
        by_month[key] = by_month.get(key, 0) + 1
    return {"total": len(rows), "by_severity": by_sev, "by_type": dict(sorted(by_type.items(), key=lambda kv: -kv[1])),
            "by_hour": by_hour, "by_month": [{"month": k, "count": v} for k, v in sorted(by_month.items())],
            "data_source": "simulated"}
