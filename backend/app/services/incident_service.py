from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.algorithms.geo import point_on_polyline
from app.core.exceptions import ConflictError, NotFoundError, ValidationFailed
from app.database.base import utcnow
from app.models import Incident, Road, User
from app.services import routing_service

TRANSITIONS = {
    "reported": {"verified", "in_progress", "resolved"},
    "verified": {"in_progress", "resolved"},
    "in_progress": {"resolved"},
    "resolved": {"in_progress"},  # re-opened
}
ACTIVE_STATUSES = ("reported", "verified", "in_progress")


def to_dict(db: Session, inc: Incident, road_names: dict[int, str] | None = None) -> dict:
    names = road_names if road_names is not None else {r.id: r.road_name for r in db.scalars(select(Road))}
    return {**{c.name: getattr(inc, c.name) for c in Incident.__table__.columns},
            "road_name": names.get(inc.road_id) if inc.road_id else None}


def create(db: Session, user: User, data) -> Incident:
    lat, lon = data.latitude, data.longitude
    if data.road_id is not None:
        road = db.get(Road, data.road_id)
        if road is None:
            raise NotFoundError(f"Road {data.road_id} not found")
        if lat is None or lon is None:
            lat, lon = point_on_polyline(road.geometry, 0.5)
    inc = Incident(road_id=data.road_id, incident_type=data.incident_type, severity=data.severity,
                   description=data.description, latitude=lat, longitude=lon, reported_by=user.id)
    db.add(inc)
    db.commit()
    return inc


def get(db: Session, incident_id: int) -> Incident:
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise NotFoundError(f"Incident {incident_id} not found")
    return inc


def list_incidents(db: Session, status: str | None, severity: str | None, road_id: int | None, active_only: bool,
                   limit: int, offset: int) -> dict:
    conds = []
    if status:
        conds.append(Incident.status == status)
    if severity:
        conds.append(Incident.severity == severity)
    if road_id:
        conds.append(Incident.road_id == road_id)
    if active_only:
        conds.append(Incident.status.in_(ACTIVE_STATUSES))
    total = db.scalar(select(func.count()).select_from(Incident).where(*conds)) or 0
    rows = list(db.scalars(select(Incident).where(*conds).order_by(Incident.created_at.desc(), Incident.id.desc())
                           .limit(limit).offset(offset)))
    names = {r.id: r.road_name for r in db.scalars(select(Road))}
    return {"items": [to_dict(db, i, names) for i in rows], "total": total, "limit": limit, "offset": offset}


def _other_closure_exists(db: Session, road_id: int, except_incident: int) -> bool:
    return bool(db.scalar(select(func.count()).select_from(Incident).where(
        Incident.road_id == road_id, Incident.closes_road.is_(True), Incident.id != except_incident,
        Incident.status.in_(ACTIVE_STATUSES))))


def update(db: Session, incident_id: int, status: str | None, severity: str | None, description: str | None) -> Incident:
    inc = get(db, incident_id)
    if status and status != inc.status:
        if status not in TRANSITIONS[inc.status]:
            raise ConflictError(f"Cannot change status from '{inc.status}' to '{status}'")
        inc.status = status
        if status == "resolved":
            inc.resolved_at = utcnow()
            if inc.closes_road and inc.road_id and not _other_closure_exists(db, inc.road_id, inc.id):
                road = db.get(Road, inc.road_id)
                road.is_closed = False  # resolving the incident reopens the road
            inc.closes_road = False
        else:
            inc.resolved_at = None
    if severity:
        inc.severity = severity
    if description is not None:
        inc.description = description
    db.commit()
    return inc


def close_road(db: Session, incident_id: int) -> dict:
    inc = get(db, incident_id)
    if inc.road_id is None:
        raise ValidationFailed("This incident is not attached to a road, so there is no road to close")
    if inc.status == "resolved":
        raise ConflictError("A resolved incident cannot close a road")
    road = db.get(Road, inc.road_id)
    road.is_closed = True
    inc.closes_road = True
    db.commit()
    rerouted, cancelled = routing_service.recalculate_after_closure(db, road.id)
    msg = f"{road.road_name} is closed."
    if rerouted or cancelled:
        msg += f" {len(rerouted)} emergency route(s) re-planned, {len(cancelled)} cancelled (no open path)."
    return {"incident": to_dict(db, inc), "road_id": road.id, "rerouted_route_ids": rerouted,
            "cancelled_route_ids": cancelled, "message": msg}
