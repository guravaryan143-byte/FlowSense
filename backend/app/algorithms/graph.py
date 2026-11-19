"""Road-network graph with Dijkstra and A* shortest-path search.

Terminology
-----------
* node      = intersection id
* edge      = one direction of a road segment, carrying both a *length* (m) and a
              traffic-adjusted *travel time* (s)
* objective = "time"      -> minimise travel time   (fastest route)
              "distance"  -> minimise length        (shortest route)
  The two can give different routes: a short road that is jammed is the shortest
  but not the fastest.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field

from app.algorithms.geo import haversine_m


class UnknownNodeError(ValueError):
    pass


@dataclass(frozen=True)
class Edge:
    road_id: int
    u: int
    v: int
    length_m: float
    time_s: float


@dataclass
class RouteResult:
    nodes: list[int]
    road_ids: list[int]
    distance_m: float
    time_s: float
    nodes_expanded: int
    algorithm: str
    objective: str


@dataclass
class RoadGraph:
    node_coords: dict[int, tuple[float, float]] = field(default_factory=dict)
    _adj: dict[int, list[Edge]] = field(default_factory=dict)
    closed_roads: set[int] = field(default_factory=set)

    def add_node(self, node_id: int, lat: float, lon: float) -> None:
        self.node_coords[node_id] = (lat, lon)
        self._adj.setdefault(node_id, [])

    def add_road(self, road_id: int, u: int, v: int, length_m: float, time_s: float, bidirectional: bool = True) -> None:
        if length_m <= 0 or time_s <= 0:
            raise ValueError("length_m and time_s must be positive")
        for n in (u, v):
            if n not in self._adj:
                raise UnknownNodeError(f"Node {n} was not added to the graph")
        self._adj[u].append(Edge(road_id, u, v, length_m, time_s))
        if bidirectional:
            self._adj[v].append(Edge(road_id, v, u, length_m, time_s))

    def neighbors(self, node: int) -> list[Edge]:
        """Outgoing edges, skipping closed roads."""
        return [e for e in self._adj.get(node, []) if e.road_id not in self.closed_roads]

    def close_road(self, road_id: int) -> None:
        self.closed_roads.add(road_id)

    def reopen_road(self, road_id: int) -> None:
        self.closed_roads.discard(road_id)

    def max_speed_mps(self) -> float:
        """Fastest effective speed on any open edge (used to keep the A* time heuristic admissible)."""
        best = 0.0
        for edges in self._adj.values():
            for e in edges:
                if e.road_id not in self.closed_roads:
                    best = max(best, e.length_m / e.time_s)
        return best or 1.0

    def straight_line_m(self, a: int, b: int) -> float:
        (la, lo), (lb, lob) = self.node_coords[a], self.node_coords[b]
        return haversine_m(la, lo, lb, lob)


def _weight(edge: Edge, objective: str, penalties: dict[int, float] | None) -> float:
    base = edge.time_s if objective == "time" else edge.length_m
    return base * (penalties.get(edge.road_id, 1.0) if penalties else 1.0)


def _check(graph: RoadGraph, source: int, target: int, objective: str) -> None:
    if objective not in ("time", "distance"):
        raise ValueError("objective must be 'time' or 'distance'")
    for n in (source, target):
        if n not in graph.node_coords:
            raise UnknownNodeError(f"Unknown node {n}")


def _rebuild(prev: dict[int, tuple[int, Edge]], source: int, target: int, expanded: int, algorithm: str, objective: str) -> RouteResult:
    nodes = [target]
    edges: list[Edge] = []
    while nodes[-1] != source:
        parent, edge = prev[nodes[-1]]
        edges.append(edge)
        nodes.append(parent)
    nodes.reverse()
    edges.reverse()
    return RouteResult(
        nodes=nodes,
        road_ids=[e.road_id for e in edges],
        distance_m=sum(e.length_m for e in edges),  # true values, never penalised ones
        time_s=sum(e.time_s for e in edges),
        nodes_expanded=expanded,
        algorithm=algorithm,
        objective=objective,
    )


def dijkstra(graph: RoadGraph, source: int, target: int, objective: str = "time",
             penalties: dict[int, float] | None = None) -> RouteResult | None:
    """Dijkstra's algorithm with a binary heap.

    Input : graph, source/target node ids, objective, optional per-road weight multipliers (>= 1).
    Output: RouteResult, or None when the target is unreachable (e.g. closures cut the network).
    Time  : O((V + E) log V).
    Idea  : repeatedly settle the unsettled node with the smallest known cost; with
            non-negative weights that cost is final the moment the node is popped.
    """
    _check(graph, source, target, objective)
    dist = {source: 0.0}
    prev: dict[int, tuple[int, Edge]] = {}
    settled: set[int] = set()
    heap = [(0.0, source)]
    expanded = 0
    while heap:
        d, node = heapq.heappop(heap)
        if node in settled:
            continue  # stale heap entry
        settled.add(node)
        expanded += 1
        if node == target:
            return _rebuild(prev, source, target, expanded, "dijkstra", objective)
        for e in graph.neighbors(node):
            nd = d + _weight(e, objective, penalties)
            if nd < dist.get(e.v, float("inf")):
                dist[e.v] = nd
                prev[e.v] = (node, e)
                heapq.heappush(heap, (nd, e.v))
    return None


def a_star(graph: RoadGraph, source: int, target: int, objective: str = "time",
           penalties: dict[int, float] | None = None) -> RouteResult | None:
    """A* search: Dijkstra guided by a heuristic h(n) that estimates the remaining cost.

    Heuristic (admissible, so the result is still optimal):
      distance objective -> straight-line distance to the target
      time objective     -> straight-line distance / fastest speed anywhere on the network
    Because every road is at least as long as the straight line between its ends, h never
    over-estimates. Penalties only increase weights, so admissibility is preserved.
    Time  : worst case same as Dijkstra; in practice expands far fewer nodes (see nodes_expanded).
    """
    _check(graph, source, target, objective)
    vmax = graph.max_speed_mps()

    def h(n: int) -> float:
        d = graph.straight_line_m(n, target)
        return d if objective == "distance" else d / vmax

    g = {source: 0.0}
    prev: dict[int, tuple[int, Edge]] = {}
    closed: set[int] = set()
    heap = [(h(source), source)]
    expanded = 0
    while heap:
        _, node = heapq.heappop(heap)
        if node in closed:
            continue
        closed.add(node)
        expanded += 1
        if node == target:
            return _rebuild(prev, source, target, expanded, "astar", objective)
        for e in graph.neighbors(node):
            ng = g[node] + _weight(e, objective, penalties)
            if ng < g.get(e.v, float("inf")):
                g[e.v] = ng
                prev[e.v] = (node, e)
                heapq.heappush(heap, (ng + h(e.v), e.v))
    return None


def find_route(graph: RoadGraph, source: int, target: int, algorithm: str = "astar", objective: str = "time",
               penalties: dict[int, float] | None = None) -> RouteResult | None:
    if algorithm == "dijkstra":
        return dijkstra(graph, source, target, objective, penalties)
    if algorithm == "astar":
        return a_star(graph, source, target, objective, penalties)
    raise ValueError("algorithm must be 'dijkstra' or 'astar'")


def alternative_route(graph: RoadGraph, source: int, target: int, primary: RouteResult, algorithm: str = "astar",
                      objective: str = "time", max_stretch: float = 1.6) -> RouteResult | None:
    """Penalty method: make the primary route's roads more expensive and search again.

    Tries penalty factors 1.5, 2.5, 4.0. Returns the first route that (a) uses a different set of
    roads and (b) costs at most `max_stretch` x the primary route. Returns None when no sensible
    alternative exists (e.g. a dead-end destination). Cost: up to 3 extra searches.
    """
    if not primary.road_ids:
        return None
    primary_cost = primary.time_s if objective == "time" else primary.distance_m
    for factor in (1.5, 2.5, 4.0):
        penalties = {rid: factor for rid in primary.road_ids}
        alt = find_route(graph, source, target, algorithm, objective, penalties)
        if alt is None:
            return None
        if set(alt.road_ids) == set(primary.road_ids):
            continue
        alt_cost = alt.time_s if objective == "time" else alt.distance_m
        if alt_cost <= primary_cost * max_stretch:
            return alt
    return None
