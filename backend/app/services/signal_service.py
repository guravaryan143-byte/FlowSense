"""Signal recommendations and measured fixed-vs-adaptive comparisons."""
from __future__ import annotations

import math

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.algorithms.geo import bearing_deg
from app.algorithms.signal import (ApproachSpec, SignalLimits, allocate_green, estimate_queue, fixed_allocation,
                                   pct_change, simulate_intersection)
from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationFailed
from app.models import Intersection, Road, SignalOptimizationRun, TrafficSignal, User
from app.services.traffic_service import latest_records


def limits_from_settings() -> SignalLimits:
    s = get_settings()
    return SignalLimits(s.signal_min_green_s, s.signal_max_green_s, s.signal_cycle_s, s.signal_lost_time_s)


def phase_at_node(road: Road, node_id: int) -> str:
    from app.algorithms.signal import phase_for_bearing
    g = road.geometry
    b = bearing_deg(*g[0], *g[1]) if road.start_node_id == node_id else bearing_deg(*g[-1], *g[-2])
    return phase_for_bearing(b)


def _approaches(roads: list[Road], node_id: int, latest: dict) -> list[dict]:
    out = []
    for r in roads:
        rec = latest.get(r.id)
        count = rec.vehicle_count if rec and not r.is_closed else 0
        occ = count / r.capacity
        out.append({"road_id": r.id, "road_name": r.road_name, "phase": phase_at_node(r, node_id),
                    "vehicle_count": count, "occupancy": round(occ, 4),
                    "estimated_queue": round(estimate_queue(count, occ), 1), "is_closed": r.is_closed})
    return out


def _timing(ns: float, ew: float, cycle: float) -> dict:
    return {"ns_green_s": round(ns, 1), "ew_green_s": round(ew, 1), "cycle_s": cycle}


def _pressure(approaches: list[dict]) -> dict[str, float]:
    p = {"NS": 0.0, "EW": 0.0}
    for a in approaches:
        if not a["is_closed"]:
            p[a["phase"]] += a["estimated_queue"]
    return {k: round(v, 1) for k, v in p.items()}


def _signal_dict(sig: TrafficSignal, node: Intersection, approaches: list[dict], limits: SignalLimits) -> dict:
    pressure = _pressure(approaches)
    rec = allocate_green({k: v + 1.0 for k, v in pressure.items()}, limits)
    fixed = fixed_allocation(limits)
    return {
        "intersection_id": node.id, "intersection_name": node.name, "latitude": node.latitude, "longitude": node.longitude,
        "current_phase": sig.current_phase, "green_duration": sig.green_duration, "mode": sig.mode, "status": sig.status,
        "current": _timing(sig.ns_green_s, sig.ew_green_s, sig.cycle_s),
        "fixed_baseline": _timing(fixed["NS"], fixed["EW"], limits.cycle_s),
        "recommended": _timing(rec["NS"], rec["EW"], limits.cycle_s),
        "total_estimated_queue": round(sum(pressure.values()), 1), "pressure": pressure, "updated_at": sig.updated_at,
    }


def _roads_by_node(db: Session) -> dict[int, list[Road]]:
    by_node: dict[int, list[Road]] = {}
    for r in db.scalars(select(Road).order_by(Road.id)):
        by_node.setdefault(r.start_node_id, []).append(r)
        by_node.setdefault(r.end_node_id, []).append(r)
    return by_node


def list_signals(db: Session) -> list[dict]:
    limits, latest, by_node = limits_from_settings(), latest_records(db), _roads_by_node(db)
    rows = db.execute(select(TrafficSignal, Intersection).join(Intersection, Intersection.id == TrafficSignal.intersection_id)
                      .order_by(Intersection.id)).all()
    return [_signal_dict(s, n, _approaches(by_node.get(n.id, []), n.id, latest), limits) for s, n in rows]


def signal_detail(db: Session, intersection_id: int) -> dict:
    sig = db.scalars(select(TrafficSignal).where(TrafficSignal.intersection_id == intersection_id)).first()
    node = db.get(Intersection, intersection_id)
    if sig is None or node is None:
        raise NotFoundError(f"No traffic signal at intersection {intersection_id}")
    roads = list(db.scalars(select(Road).where(or_(Road.start_node_id == node.id, Road.end_node_id == node.id))))
    appr = _approaches(roads, node.id, latest_records(db))
    out = _signal_dict(sig, node, appr, limits_from_settings())
    out["approaches"] = appr
    out["last_run"] = db.scalars(select(SignalOptimizationRun).where(SignalOptimizationRun.intersection_id == node.id)
                                 .order_by(SignalOptimizationRun.created_at.desc())).first()
    return out


def _approach_specs(roads: list[Road], node_id: int, latest: dict) -> list[ApproachSpec]:
    """Turn live traffic into simulation inputs.

    flow  q = k * v  (vehicles per km x km/h = vehicles/hour, both directions);
    about half of it arrives at THIS junction.  The current estimated queue becomes the initial queue.
    """
    specs = []
    for r in roads:
        rec = latest.get(r.id)
        if r.is_closed or rec is None:
            continue
        flow = rec.vehicle_count / (r.length_m / 1000.0) * rec.average_speed
        lanes = max(1, round(r.lanes / 2))
        arrival = min(max(0.5 * flow, 120.0), 900.0 * lanes)
        queue = estimate_queue(rec.vehicle_count, rec.vehicle_count / r.capacity)
        specs.append(ApproachSpec(r.road_name, phase_at_node(r, node_id), arrival, lanes, int(round(queue / 2))))
    return specs


def _verdict(wait_red: float | None) -> str:
    if wait_red is None:
        return "No vehicles arrived in this scenario, so nothing can be compared."
    if wait_red >= 5:
        return f"Adaptive timing reduced average waiting time by {wait_red}% in this simulation."
    if wait_red <= -5:
        return f"Fixed-time performed better here: adaptive increased average waiting time by {abs(wait_red)}%."
    return "No meaningful difference (within ±5%) between fixed-time and adaptive timing in this scenario."


def optimize(db: Session, intersection_id: int, scenario: str, duration_s: int, seed: int, apply: bool,
             user: User | None) -> dict:
    sig = db.scalars(select(TrafficSignal).where(TrafficSignal.intersection_id == intersection_id)).first()
    node = db.get(Intersection, intersection_id)
    if sig is None or node is None:
        raise NotFoundError(f"No traffic signal at intersection {intersection_id}")
    limits = limits_from_settings()
    roads = list(db.scalars(select(Road).where(or_(Road.start_node_id == node.id, Road.end_node_id == node.id))))
    latest = latest_records(db)
    specs = _approach_specs(roads, node.id, latest)
    if not specs:
        raise ValidationFailed("This intersection has no open approaches with traffic data to simulate")

    appr = _approaches(roads, node.id, latest)
    pressure = _pressure(appr)
    rec = allocate_green({k: v + 1.0 for k, v in pressure.items()}, limits)
    fixed = fixed_allocation(limits)

    # SAME seed => identical vehicle arrivals for both strategies (fair comparison)
    res_fixed = simulate_intersection(specs, "fixed", limits, duration_s, seed, scenario)
    res_adapt = simulate_intersection(specs, "adaptive", limits, duration_s, seed, scenario)
    wait_red = pct_change(res_fixed["avg_wait_s"], res_adapt["avg_wait_s"])
    wait_red = None if wait_red is None else -wait_red
    queue_red = pct_change(res_fixed["avg_queue"], res_adapt["avg_queue"])
    queue_red = None if queue_red is None else -queue_red
    improvement = {"wait_reduction_pct": wait_red, "queue_reduction_pct": queue_red,
                   "throughput_change_pct": pct_change(res_fixed["throughput"], res_adapt["throughput"]),
                   "verdict": _verdict(wait_red)}
    fixed_t, adaptive_t = _timing(fixed["NS"], fixed["EW"], limits.cycle_s), _timing(rec["NS"], rec["EW"], limits.cycle_s)

    if apply:
        sig.mode, sig.ns_green_s, sig.ew_green_s, sig.cycle_s = "adaptive", rec["NS"], rec["EW"], limits.cycle_s
    run = SignalOptimizationRun(intersection_id=node.id, scenario=scenario, duration_s=duration_s, seed=seed, applied=apply,
                                fixed_timing=fixed_t, adaptive_timing=adaptive_t, fixed_metrics=res_fixed,
                                adaptive_metrics=res_adapt, improvement=improvement, created_by=user.id if user else None)
    db.add(run)
    db.commit()
    return {
        "run_id": run.id, "intersection_id": node.id, "intersection_name": node.name, "scenario": scenario,
        "duration_s": duration_s, "seed": seed, "applied": apply, "approaches": appr,
        "fixed_timing": fixed_t, "adaptive_timing": adaptive_t, "fixed": res_fixed, "adaptive": res_adapt,
        "improvement": improvement, "created_at": run.created_at,
        "notice": ("Results come from a simulated intersection fed with identical random arrivals (same seed) under both "
                   "strategies. Arrival rates are derived from SIMULATED city traffic; they are not real measurements."),
    }


def reset_to_fixed(db: Session, intersection_id: int) -> TrafficSignal:
    sig = db.scalars(select(TrafficSignal).where(TrafficSignal.intersection_id == intersection_id)).first()
    if sig is None:
        raise NotFoundError(f"No traffic signal at intersection {intersection_id}")
    limits = limits_from_settings()
    fixed = fixed_allocation(limits)
    sig.mode, sig.ns_green_s, sig.ew_green_s, sig.cycle_s = "fixed", fixed["NS"], fixed["EW"], limits.cycle_s
    db.commit()
    return sig
