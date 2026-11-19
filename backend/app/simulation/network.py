"""The fictional demo city: 16 intersections in a slightly distorted 4x4 grid plus 4 diagonal links.

The coordinates sit over a real map area so Leaflet/OpenStreetMap tiles render, but ALL street
names are invented. Nothing here is a real road or real traffic.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from app.algorithms.geo import bearing_deg, polyline_length_m
from app.algorithms.signal import phase_for_bearing

JAM_DENSITY_PER_LANE_KM = 120.0  # vehicles / km / lane when bumper to bumper

LAT0, LON0 = 18.5090, 73.8390
D_LAT, D_LON = 0.0068, 0.0074

NODE_NAMES = [
    ["Northgate Circle", "Market Square", "Civic Centre", "Lakeside Junction"],
    ["University Gate", "Old Town Cross", "Central Station", "Tech Park Junction"],
    ["Riverside Junction", "Courthouse Square", "City Hospital Junction", "Stadium Circle"],
    ["Southgate Circle", "Harbour Cross", "Industrial Junction", "Airport Link Junction"],
]
ROW_ROADS = ["Ring Road North", "Central Avenue", "Riverside Boulevard", "Ring Road South"]
COL_ROADS = ["Western Expressway", "Station Road", "Hospital Road", "Eastern Bypass"]
DIAGONALS = [  # (row, col) of the top-left cell corner, name
    (0, 0, "Old Town Link"),
    (1, 2, "Stadium Link"),
    (2, 0, "Harbour Link"),
    (2, 1, "Industrial Link"),
]
SEGMENT_LABELS = {0: "First", 1: "Second", 2: "Third"}

ROAD_PROFILES = {
    # type: (lanes, speed limit km/h, external demand veh/min at demand multiplier 1.0)
    # Demand was calibrated (see docs/ARCHITECTURE.md): ~0.08 occupancy at night, ~0.45-0.55 at peaks.
    "arterial": (3, 60.0, 6.0),
    "collector": (2, 40.0, 3.9),
    "local": (1, 30.0, 1.9),
}


@dataclass(frozen=True)
class IntersectionSpec:
    id: int
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class RoadSpec:
    id: int
    name: str
    start_id: int
    end_id: int
    length_m: float
    lanes: int
    speed_limit_kmh: float
    road_type: str
    capacity: int
    geometry: list[list[float]]
    base_demand_vpm: float


def _road_type(kind: str, index: int) -> str:
    if kind == "row":
        return "arterial" if index in (0, 1, 3) else "collector"
    return "arterial" if index in (0, 3) else "collector"


def build_sample_city() -> tuple[list[IntersectionSpec], list[RoadSpec]]:
    rng = random.Random(7)  # fixed seed -> identical city every run
    nodes: list[IntersectionSpec] = []
    grid: dict[tuple[int, int], IntersectionSpec] = {}
    nid = 1
    for r in range(4):
        for c in range(4):
            lat = LAT0 + (3 - r) * D_LAT + rng.uniform(-0.0007, 0.0007)
            lon = LON0 + c * D_LON + rng.uniform(-0.0007, 0.0007)
            spec = IntersectionSpec(nid, NODE_NAMES[r][c], round(lat, 6), round(lon, 6))
            nodes.append(spec)
            grid[(r, c)] = spec
            nid += 1

    roads: list[RoadSpec] = []

    def add(name: str, a: IntersectionSpec, b: IntersectionSpec, rtype: str) -> None:
        lanes, limit, demand = ROAD_PROFILES[rtype]
        # a slight bend in the middle makes the polyline look like a real street
        mid_lat = (a.lat + b.lat) / 2 + rng.uniform(-0.0003, 0.0003)
        mid_lon = (a.lon + b.lon) / 2 + rng.uniform(-0.0003, 0.0003)
        geometry = [[a.lat, a.lon], [round(mid_lat, 6), round(mid_lon, 6)], [b.lat, b.lon]]
        length = polyline_length_m(geometry)
        capacity = max(10, round(JAM_DENSITY_PER_LANE_KM * (length / 1000.0) * lanes))
        roads.append(RoadSpec(len(roads) + 1, name, a.id, b.id, round(length, 1), lanes, limit, rtype,
                              capacity, geometry, demand))

    for r in range(4):  # horizontal roads, west -> east
        for c in range(3):
            add(f"{ROW_ROADS[r]} ({SEGMENT_LABELS[c]} Section)", grid[(r, c)], grid[(r, c + 1)], _road_type("row", r))
    for c in range(4):  # vertical roads, north -> south
        for r in range(3):
            add(f"{COL_ROADS[c]} ({SEGMENT_LABELS[r]} Section)", grid[(r, c)], grid[(r + 1, c)], _road_type("col", c))
    for r, c, name in DIAGONALS:
        add(name, grid[(r, c)], grid[(r + 1, c + 1)], "local")
    return nodes, roads


@dataclass
class SimRoad:
    id: int
    u: int
    v: int
    length_m: float
    lanes: int
    capacity: int
    speed_limit_kmh: float
    base_demand_vpm: float
    road_type: str
    group_u: str  # signal phase group of this road at node u ("NS"/"EW")
    group_v: str


@dataclass
class SimNetwork:
    roads: dict[int, SimRoad] = field(default_factory=dict)
    node_roads: dict[int, list[int]] = field(default_factory=dict)

    @classmethod
    def from_specs(cls, nodes_xy: dict[int, tuple[float, float]], roads: list) -> "SimNetwork":
        """Build from anything road-like having id/start/end/length/lanes/... (specs or ORM rows)."""
        net = cls()
        for r in roads:
            sid, eid = _attr(r, "start_id", "start_node_id"), _attr(r, "end_id", "end_node_id")
            geom = r.geometry
            (ulat, ulon), (vlat, vlon) = nodes_xy[sid], nodes_xy[eid]
            # bearing measured from the node along the road (use first/last polyline segment)
            b_u = bearing_deg(geom[0][0], geom[0][1], geom[1][0], geom[1][1])
            b_v = bearing_deg(geom[-1][0], geom[-1][1], geom[-2][0], geom[-2][1])
            _, _, demand = ROAD_PROFILES[r.road_type]
            net.roads[r.id] = SimRoad(
                id=r.id, u=sid, v=eid, length_m=_attr(r, "length_m", "length_m"), lanes=r.lanes,
                capacity=r.capacity, speed_limit_kmh=r.speed_limit_kmh, base_demand_vpm=demand,
                road_type=r.road_type, group_u=phase_for_bearing(b_u), group_v=phase_for_bearing(b_v),
            )
            net.node_roads.setdefault(sid, []).append(r.id)
            net.node_roads.setdefault(eid, []).append(r.id)
        return net


def _attr(obj, *names):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    raise AttributeError(names)


def sample_network() -> tuple[list[IntersectionSpec], list[RoadSpec], SimNetwork]:
    nodes, roads = build_sample_city()
    xy = {n.id: (n.lat, n.lon) for n in nodes}
    return nodes, roads, SimNetwork.from_specs(xy, roads)
