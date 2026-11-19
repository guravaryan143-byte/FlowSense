"""Dijkstra and A* on hand-checkable graphs."""
import pytest

from app.algorithms.graph import RoadGraph, UnknownNodeError, a_star, alternative_route, dijkstra, find_route


def make_graph() -> RoadGraph:
    """
        2 ----(road 11, 100 s)---- 4 ---(road 14, 100 s)--- 5
        |                          |
     (road 10, 100 s)         (road 13, 50 s)
        |                          |
        1 ----(road 12, 300 s)---- 3
    Coordinates are a rough 0.01-degree square so straight-line distance <= road length (A* stays admissible).
    """
    g = RoadGraph()
    for n, (lat, lon) in {1: (0, 0), 2: (0, 0.01), 3: (0.01, 0), 4: (0.01, 0.01), 5: (0.02, 0.01)}.items():
        g.add_node(n, lat, lon)
    g.add_road(10, 1, 2, 1200, 100)
    g.add_road(11, 2, 4, 1200, 100)
    g.add_road(12, 1, 3, 1200, 300)
    g.add_road(13, 3, 4, 1200, 50)
    g.add_road(14, 4, 5, 1200, 100)
    return g


@pytest.mark.parametrize("algo", [dijkstra, a_star])
def test_fastest_route_known_answer(algo):
    r = algo(make_graph(), 1, 5, "time")
    assert r.nodes == [1, 2, 4, 5]
    assert r.road_ids == [10, 11, 14]
    assert r.time_s == 300
    assert r.distance_m == 3600


@pytest.mark.parametrize("algo", [dijkstra, a_star])
def test_closed_road_forces_detour(algo):
    g = make_graph()
    g.close_road(11)  # the fast middle road
    r = algo(g, 1, 5, "time")
    assert r.road_ids == [12, 13, 14]
    assert r.time_s == 450
    g.reopen_road(11)
    assert algo(g, 1, 5, "time").road_ids == [10, 11, 14]  # recalculation after reopening


@pytest.mark.parametrize("algo", [dijkstra, a_star])
def test_unreachable_returns_none(algo):
    g = make_graph()
    g.close_road(14)  # only road into node 5
    assert algo(g, 1, 5, "time") is None


def test_same_node_is_zero_route():
    r = dijkstra(make_graph(), 3, 3)
    assert r.nodes == [3] and r.road_ids == [] and r.time_s == 0


def test_unknown_node_raises():
    with pytest.raises(UnknownNodeError):
        dijkstra(make_graph(), 1, 99)


def test_shortest_distance_differs_from_fastest_time():
    g = RoadGraph()
    for n, (lat, lon) in {1: (0, 0), 2: (0, 0.005), 3: (0.002, 0.0025)}.items():
        g.add_node(n, lat, lon)
    g.add_road(1, 1, 2, 560, 600)        # direct but jammed: short, slow
    g.add_road(2, 1, 3, 450, 40)         # detour legs: each longer than half the direct road, but quick
    g.add_road(3, 3, 2, 450, 40)
    fastest = dijkstra(g, 1, 2, "time")
    shortest = dijkstra(g, 1, 2, "distance")
    assert fastest.road_ids == [2, 3] and fastest.time_s == 80
    assert shortest.road_ids == [1] and shortest.distance_m == 560
    assert fastest.road_ids != shortest.road_ids


def test_astar_and_dijkstra_agree_on_random_grid():
    import random
    rng = random.Random(1)
    g = RoadGraph()
    n = 6
    for r in range(n):
        for c in range(n):
            g.add_node(r * n + c, r * 0.005, c * 0.005)
    rid = 0
    for r in range(n):
        for c in range(n):
            for dr, dc in ((0, 1), (1, 0)):
                if r + dr < n and c + dc < n:
                    rid += 1
                    length = 550.0
                    g.add_road(rid, r * n + c, (r + dr) * n + c + dc, length, length / rng.uniform(3, 15))
    for _ in range(20):
        s, t = rng.sample(range(n * n), 2)
        d, a = dijkstra(g, s, t, "time"), a_star(g, s, t, "time")
        assert d.time_s == pytest.approx(a.time_s)
        assert a.nodes_expanded <= d.nodes_expanded + 5  # A* should not be much worse than Dijkstra


def test_alternative_route_is_different_and_valid():
    g = make_graph()
    primary = dijkstra(g, 1, 5, "time")
    alt = alternative_route(g, 1, 5, primary, "dijkstra", "time", max_stretch=2.0)
    assert alt is not None and set(alt.road_ids) != set(primary.road_ids)
    assert alt.road_ids == [12, 13, 14]  # the only other way


def test_invalid_inputs():
    g = make_graph()
    with pytest.raises(ValueError):
        g.add_road(99, 1, 2, 0, 10)
    with pytest.raises(ValueError):
        find_route(g, 1, 5, algorithm="bfs")
    with pytest.raises(ValueError):
        dijkstra(g, 1, 5, objective="cheapest")
