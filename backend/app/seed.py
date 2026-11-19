"""Populate an EMPTY database with the demo city, simulated history, accidents, incidents and demo users.

    python -m app.seed            # seed (refuses if data exists)
    python -m app.seed --reset    # delete all FlowSense data first, then seed
All generated data is SIMULATED.
"""
from __future__ import annotations

import argparse
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.algorithms.geo import point_on_polyline
from app.algorithms.signal import SignalLimits, fixed_allocation
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import (AccidentRecord, EmergencyRoute, EmergencyVehicle, Incident, Intersection, Road,
                        SignalOptimizationRun, TrafficPrediction, TrafficRecord, TrafficSignal, User)
from app.simulation.engine import classify_occupancy
from app.simulation.generate_data import generate_history
from app.simulation.network import build_sample_city

log = logging.getLogger("flowsense.seed")

ACCIDENT_TYPES = ["rear_end", "side_impact", "pedestrian", "sideswipe", "single_vehicle", "head_on", "two_wheeler"]
SEVERITIES = ["low", "medium", "high", "critical"]
# (road id, position along road 0..1, dominant type) -> five planted clusters of historical accidents
HOTSPOTS = [(3, 0.95, "rear_end"), (12, 0.50, "pedestrian"), (17, 0.05, "side_impact"), (21, 0.60, "two_wheeler"), (9, 0.90, "sideswipe")]

VEHICLES = [("Ambulance A1", "ambulance", 10), ("Ambulance A2", "ambulance", 3), ("Ambulance A3", "ambulance", 14),
            ("Ambulance A4", "ambulance", 6), ("Fire Engine F1", "fire_service", 8), ("Fire Engine F2", "fire_service", 13),
            ("Fire Engine F3", "fire_service", 1)]


def _jitter(rng: np.random.Generator, lat: float, sigma_m: float) -> tuple[float, float]:
    dlat = rng.normal(0, sigma_m) / 111_320.0
    dlon = rng.normal(0, sigma_m) / (111_320.0 * np.cos(np.radians(lat)))
    return dlat, dlon


def _accidents(roads: list[Road], count: int, rng: np.random.Generator, now: datetime) -> list[dict]:
    by_id = {r.id: r for r in roads}
    lengths = np.array([r.length_m for r in roads], dtype=float)
    rows: list[dict] = []
    n_hot = int(count * 0.6)
    weights = np.array([0.30, 0.25, 0.20, 0.15, 0.10])
    for i in range(count):
        hot = i < n_hot
        if hot:
            k = int(rng.choice(len(HOTSPOTS), p=weights))
            rid, frac, dominant = HOTSPOTS[k]
            lat, lon = point_on_polyline(by_id[rid].geometry, frac)
            dlat, dlon = _jitter(rng, lat, 35)
            a_type = dominant if rng.random() < 0.55 else str(rng.choice(ACCIDENT_TYPES))
            sev = str(rng.choice(SEVERITIES, p=[0.30, 0.38, 0.22, 0.10]))
        else:
            road = roads[int(rng.choice(len(roads), p=lengths / lengths.sum()))]
            rid = road.id
            lat, lon = point_on_polyline(road.geometry, float(rng.random()))
            dlat, dlon = _jitter(rng, lat, 15)
            a_type = str(rng.choice(ACCIDENT_TYPES))
            sev = str(rng.choice(SEVERITIES, p=[0.50, 0.33, 0.13, 0.04]))
        day = int(rng.integers(0, 730))
        hour = int(rng.choice(24, p=_hour_weights()))
        when = (now - timedelta(days=day)).replace(hour=hour, minute=int(rng.integers(0, 60)), second=0, microsecond=0)
        rows.append({"road_id": rid, "accident_type": a_type, "severity": sev, "latitude": round(lat + dlat, 6),
                     "longitude": round(lon + dlon, 6), "occurred_at": when, "data_source": "simulated"})
    return rows


def _hour_weights() -> np.ndarray:
    h = np.arange(24)
    w = 0.3 + np.exp(-0.5 * ((h - 8.5) / 1.8) ** 2) + 1.2 * np.exp(-0.5 * ((h - 18) / 2.2) ** 2) + 0.4 * np.exp(-0.5 * ((h - 13) / 3) ** 2)
    return w / w.sum()


def _is_empty(db: Session) -> bool:
    return not db.scalar(select(func.count()).select_from(Road))


def reset_all(db: Session) -> None:
    for model in (EmergencyRoute, SignalOptimizationRun, TrafficPrediction, TrafficRecord, Incident, AccidentRecord,
                  EmergencyVehicle, TrafficSignal, Road, Intersection):
        db.execute(delete(model))
    # Only the demo accounts are removed; accounts people registered themselves are kept.
    db.execute(delete(User).where(User.email.like("%@flowsense.demo")))
    db.commit()
    if db.bind.dialect.name == "postgresql":  # make ids start at 1 again
        from sqlalchemy import text
        for t in ("intersections", "roads", "traffic_signals", "emergency_vehicles", "incidents", "accident_records"):
            db.execute(text(f"ALTER SEQUENCE {t}_id_seq RESTART WITH 1"))
        db.commit()


def seed_database(db: Session, history_days: int = 8, accident_count: int = 700, seed: int = 42,
                  default_password: str | None = None, end_time: datetime | None = None) -> dict:
    if not _is_empty(db):
        raise RuntimeError("Database already contains a road network. Use --reset to wipe and re-seed.")
    now = (end_time or datetime.now(timezone.utc)).replace(second=0, microsecond=0, tzinfo=timezone.utc)
    node_specs, road_specs = build_sample_city()

    for n in node_specs:
        node = Intersection(name=n.name, latitude=n.lat, longitude=n.lon)
        db.add(node)
        db.flush()
        assert node.id == n.id, "Intersection ids differ from the network definition: seed an EMPTY database"
    roads: list[Road] = []
    for r in road_specs:
        road = Road(road_name=r.name, start_node_id=r.start_id, end_node_id=r.end_id, length_m=r.length_m, lanes=r.lanes,
                    speed_limit_kmh=r.speed_limit_kmh, road_type=r.road_type, capacity=r.capacity, geometry=r.geometry)
        db.add(road)
        db.flush()
        assert road.id == r.id, "Road ids differ from the network definition: seed an EMPTY database"
        roads.append(road)

    s = get_settings()
    limits = SignalLimits(s.signal_min_green_s, s.signal_max_green_s, s.signal_cycle_s, s.signal_lost_time_s)
    fixed = fixed_allocation(limits)
    for n in node_specs:
        db.add(TrafficSignal(intersection_id=n.id, ns_green_s=fixed["NS"], ew_green_s=fixed["EW"], cycle_s=limits.cycle_s))
    for name, vtype, node_id in VEHICLES:
        db.add(EmergencyVehicle(unit_name=name, vehicle_type=vtype, current_intersection_id=node_id))
    db.flush()  # one transaction for the whole seed: a failure leaves the database untouched

    hist = generate_history(days=history_days, end_time=now, seed=seed)
    cap = {r.id: r.capacity for r in roads}
    rows = [{"road_id": int(t.road_id), "recorded_at": t.recorded_at.to_pydatetime(), "vehicle_count": int(t.vehicle_count),
             "average_speed": float(t.average_speed), "density": float(t.density),
             "congestion_level": classify_occupancy(t.vehicle_count / cap[int(t.road_id)]), "data_source": "simulated"}
            for t in hist.itertuples()]
    for i in range(0, len(rows), 5000):
        db.execute(insert(TrafficRecord), rows[i:i + 5000])

    rng = np.random.default_rng(seed)
    acc = _accidents(roads, accident_count, rng, now)
    db.execute(insert(AccidentRecord), acc)

    sample_incidents = [
        (4, "breakdown", "medium", "Broken-down bus blocking the left lane.", "in_progress"),
        (19, "road_work", "low", "Resurfacing works, one lane closed overnight.", "verified"),
        (11, "accident", "high", "Two-vehicle collision near the junction.", "reported"),
        (26, "hazard", "low", "Debris on carriageway (cleared).", "resolved"),
    ]
    by_id = {r.id: r for r in roads}
    for rid, typ, sev, desc, status in sample_incidents:
        lat, lon = point_on_polyline(by_id[rid].geometry, 0.5)
        db.add(Incident(road_id=rid, incident_type=typ, severity=sev, description=desc, latitude=lat, longitude=lon,
                        status=status, created_at=now - timedelta(minutes=int(rng.integers(10, 600))),
                        resolved_at=now if status == "resolved" else None))

    credentials = []
    if default_password:
        for name, email, role in (("Demo Admin", "admin@flowsense.demo", "admin"), ("Demo Operator", "operator@flowsense.demo", "operator"),
                                  ("Demo Viewer", "viewer@flowsense.demo", "viewer")):
            db.add(User(name=name, email=email, role=role, password_hash=hash_password(default_password)))
            credentials.append((email, role))
    db.commit()
    return {"intersections": len(node_specs), "roads": len(roads), "traffic_records": len(rows), "accidents": len(acc),
            "incidents": len(sample_incidents), "emergency_vehicles": len(VEHICLES), "demo_users": credentials}


def main() -> None:
    from app.database.session import get_session_factory

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Seed FlowSense with SIMULATED demo data")
    p.add_argument("--reset", action="store_true", help="delete existing FlowSense data first")
    p.add_argument("--days", type=int, default=8, help="days of simulated traffic history (default 8)")
    p.add_argument("--accidents", type=int, default=700)
    args = p.parse_args()
    password = os.environ.get("SEED_DEFAULT_PASSWORD") or ""
    generated = False
    if not password:
        password, generated = secrets.token_urlsafe(12) + "aA1!", True
    with get_session_factory()() as db:
        if args.reset:
            reset_all(db)
        result = seed_database(db, args.days, args.accidents, default_password=password)
    print("Seeded (SIMULATED data):", {k: v for k, v in result.items() if k != "demo_users"})
    print("Demo accounts:", ", ".join(f"{e} ({r})" for e, r in result["demo_users"]))
    print(f"Password: {password}" + ("   <- randomly generated, shown once" if generated else "   (from SEED_DEFAULT_PASSWORD)"))


if __name__ == "__main__":
    main()
