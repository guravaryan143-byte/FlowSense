"""Emergency routing on the traffic-weighted road graph."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.algorithms.graph import RoadGraph, RouteResult, alternative_route, find_route
from app.core.exceptions import ConflictError, NoRouteError, NotFoundError, ValidationFailed
from app.models import EmergencyRoute, EmergencyVehicle, Intersection, Road, User
from app.services.traffic_service import latest_records

# Emergency vehicles move faster than surrounding traffic (sirens, lane clearing) but never beyond the limit.
SPEED_FACTOR = {"ambulance": 1.35, "fire_service": 1.25}
MIN_SPEED_KMH = 5.0
# Fire appliances are wide: they avoid narrow 'local' streets.
EXCLUDED_TYPES = {"ambulance": set(), "fire_service": {"local"}}


def build_graph(db: Session, vehicle_type: str) -> tuple[RoadGraph, dict[int, Road], dict[int, Intersection]]:
    """Weighted graph: edge time = length / effective emergency speed, using the LATEST traffic records."""
    nodes = {n.id: n for n in db.scalars(select(Intersection))}
    roads = {r.id: r for r in db.scalars(select(Road))}
    latest = latest_records(db)
    g = RoadGraph()
    for n in nodes.values():
        g.add_node(n.id, n.latitude, n.longitude)
    for r in roads.values():
        if r.road_type in EXCLUDED_TYPES[vehicle_type]:
            continue
        rec = latest.get(r.id)
        traffic_speed = max(MIN_SPEED_KMH, rec.average_speed if rec else r.speed_limit_kmh)
        eff_kmh = min(r.speed_limit_kmh, traffic_speed * SPEED_FACTOR[vehicle_type])
        g.add_road(r.id, r.start_node_id, r.end_node_id, r.length_m, r.length_m / (eff_kmh / 3.6))
        if r.is_closed:
            g.close_road(r.id)
    return g, roads, nodes


def _planned(res: RouteResult, roads: dict[int, Road], nodes: dict[int, Intersection], g: RoadGraph, latest: dict) -> dict:
    geometry: list[list[float]] = []
    road_rows = []
    for i, rid in enumerate(res.road_ids):
        r, here = roads[rid], res.nodes[i]
        pts = r.geometry if r.start_node_id == here else list(reversed(r.geometry))
        geometry.extend(pts if not geometry else pts[1:])
        edge_time = next(e.time_s for e in g.neighbors(here) if e.road_id == rid and e.v == res.nodes[i + 1])
        rec = latest.get(rid)
        road_rows.append({"id": rid, "name": r.road_name, "length_m": round(r.length_m, 1), "time_s": round(edge_time, 1),
                          "congestion_level": rec.congestion_level if rec else "free_flow"})
    return {
        "nodes": [{"id": n, "name": nodes[n].name, "lat": nodes[n].latitude, "lon": nodes[n].longitude} for n in res.nodes],
        "roads": road_rows, "geometry": geometry, "distance_m": round(res.distance_m, 1), "time_s": round(res.time_s, 1),
        "nodes_expanded": res.nodes_expanded, "algorithm": res.algorithm, "objective": res.objective,
    }


def compute(db: Session, vehicle_type: str, origin: int, destination: int, algorithm: str, objective: str,
            include_alternative: bool) -> dict:
    """Plan a route. Returns {route, alternative, comparison, road_ids} (route_data payload)."""
    g, roads, nodes = build_graph(db, vehicle_type)
    for n in (origin, destination):
        if n not in nodes:
            raise NotFoundError(f"Intersection {n} not found")
    if origin == destination:
        raise ValidationFailed("Origin and destination must be different intersections")
    obj = "time" if objective == "fastest" else "distance"
    fastest = find_route(g, origin, destination, algorithm, "time")
    shortest = find_route(g, origin, destination, algorithm, "distance")
    if fastest is None or shortest is None:
        raise NoRouteError("No open route exists between these intersections (closures may have cut the network)")
    primary = fastest if obj == "time" else shortest
    latest = latest_records(db)
    alt = alternative_route(g, origin, destination, primary, algorithm, obj) if include_alternative else None
    return {
        "route": _planned(primary, roads, nodes, g, latest),
        "alternative": _planned(alt, roads, nodes, g, latest) if alt else None,
        "comparison": {
            "fastest_time_s": round(fastest.time_s, 1), "fastest_distance_m": round(fastest.distance_m, 1),
            "shortest_time_s": round(shortest.time_s, 1), "shortest_distance_m": round(shortest.distance_m, 1),
            "same_route": fastest.road_ids == shortest.road_ids,
            "time_saved_by_fastest_s": round(shortest.time_s - fastest.time_s, 1),
        },
        "road_ids": primary.road_ids,
    }


def _to_out(r: EmergencyRoute) -> dict:
    d = r.route_data or {}
    return {
        "id": r.id, "status": r.status, "vehicle_id": r.vehicle_id, "vehicle_type": r.vehicle_type,
        "origin_intersection_id": r.origin_intersection_id, "destination_intersection_id": r.destination_intersection_id,
        "algorithm": r.algorithm, "objective": r.objective, "route": d.get("route"), "alternative": d.get("alternative"),
        "comparison": d.get("comparison"), "reroute_count": r.reroute_count, "note": d.get("note"),
        "created_at": r.created_at, "updated_at": r.updated_at,
    }


def create_route(db: Session, user: User, vehicle_id: int | None, vehicle_type: str | None, origin: int | None,
                 destination: int, algorithm: str, objective: str, include_alternative: bool) -> dict:
    vehicle = None
    if vehicle_id is not None:
        vehicle = db.get(EmergencyVehicle, vehicle_id)
        if vehicle is None:
            raise NotFoundError(f"Emergency vehicle {vehicle_id} not found")
        if vehicle_type and vehicle_type != vehicle.vehicle_type:
            raise ValidationFailed("vehicle_type does not match the selected vehicle")
        if vehicle.status == "offline":
            raise ConflictError(f"{vehicle.unit_name} is offline")
        vehicle_type = vehicle.vehicle_type
        origin = origin or vehicle.current_intersection_id
    data = compute(db, vehicle_type, origin, destination, algorithm, objective, include_alternative)
    road_ids = data.pop("road_ids")
    route = EmergencyRoute(
        vehicle_id=vehicle_id, vehicle_type=vehicle_type, origin_intersection_id=origin,
        destination_intersection_id=destination, algorithm=algorithm, objective=objective,
        route_data={**data, "road_ids": road_ids}, distance_m=data["route"]["distance_m"],
        estimated_time_s=data["route"]["time_s"], created_by=user.id,
    )
    db.add(route)
    db.commit()
    return _to_out(route)


def get_route(db: Session, route_id: int) -> EmergencyRoute:
    r = db.get(EmergencyRoute, route_id)
    if r is None:
        raise NotFoundError(f"Route {route_id} not found")
    return r


def route_out(r: EmergencyRoute) -> dict:
    return _to_out(r)


def list_routes(db: Session, limit: int = 20) -> list[dict]:
    return [_to_out(r) for r in db.scalars(select(EmergencyRoute).order_by(EmergencyRoute.id.desc()).limit(limit))]


def recalculate(db: Session, route: EmergencyRoute) -> dict:
    """Re-plan with the CURRENT traffic and closures. Marks the route 'rerouted' when the roads changed."""
    previous_time, previous_roads = route.estimated_time_s, (route.route_data or {}).get("road_ids", [])
    try:
        data = compute(db, route.vehicle_type, route.origin_intersection_id, route.destination_intersection_id,
                       route.algorithm, route.objective, True)
    except NoRouteError as exc:
        route.status = "cancelled"
        route.route_data = {**(route.route_data or {}), "note": exc.message}
        db.commit()
        return {"route": _to_out(route), "changed": True, "previous_time_s": previous_time, "new_time_s": None}
    road_ids = data.pop("road_ids")
    changed = road_ids != previous_roads
    route.route_data = {**data, "road_ids": road_ids,
                        "note": "Rerouted after a traffic or closure change" if changed else "Re-checked: route unchanged"}
    route.distance_m, route.estimated_time_s = data["route"]["distance_m"], data["route"]["time_s"]
    if changed:
        route.status, route.reroute_count = "rerouted", route.reroute_count + 1
    db.commit()
    return {"route": _to_out(route), "changed": changed, "previous_time_s": previous_time, "new_time_s": route.estimated_time_s}


def recalculate_after_closure(db: Session, road_id: int) -> tuple[list[int], list[int]]:
    """Re-plan every live route that used the closed road. Returns (rerouted ids, cancelled ids)."""
    rerouted, cancelled = [], []
    for r in db.scalars(select(EmergencyRoute).where(EmergencyRoute.status.in_(("active", "rerouted")))):
        if road_id in (r.route_data or {}).get("road_ids", []):
            result = recalculate(db, r)
            (cancelled if result["route"]["status"] == "cancelled" else rerouted).append(r.id)
    return rerouted, cancelled


def list_vehicles(db: Session) -> list[EmergencyVehicle]:
    return list(db.scalars(select(EmergencyVehicle).order_by(EmergencyVehicle.id)))
