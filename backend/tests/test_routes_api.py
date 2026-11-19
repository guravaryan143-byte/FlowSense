def plan(client, headers, **kw):
    body = {"vehicle_type": "ambulance", "origin_intersection_id": 1, "destination_intersection_id": 15, **kw}
    return client.post("/api/routes/emergency", json=body, headers=headers)


def test_requires_operator(client, viewer, operator):
    assert plan(client, {}).status_code == 401
    assert plan(client, viewer).status_code == 403
    assert plan(client, operator).status_code == 201


def test_route_uses_real_connected_roads(client, operator):
    d = plan(client, operator).json()
    route, roads = d["route"], {r["id"]: r for r in client.get("/api/roads").json()}
    nodes = [n["id"] for n in route["nodes"]]
    assert nodes[0] == 1 and nodes[-1] == 15 and len(set(nodes)) == len(nodes)
    for rr, a, b in zip(route["roads"], nodes, nodes[1:]):
        assert {roads[rr["id"]]["start_node_id"], roads[rr["id"]]["end_node_id"]} == {a, b}  # each hop is a real road
    assert route["distance_m"] == sum(r["length_m"] for r in route["roads"]) or abs(route["distance_m"] - sum(r["length_m"] for r in route["roads"])) < 1
    assert d["comparison"]["fastest_time_s"] <= d["comparison"]["shortest_time_s"] + 0.01
    assert d["data_source"] == "simulated"


def test_dijkstra_and_astar_give_same_cost(client, operator):
    a = plan(client, operator, algorithm="astar").json()["route"]
    d = plan(client, operator, algorithm="dijkstra").json()["route"]
    assert a["time_s"] == d["time_s"] and a["nodes_expanded"] <= d["nodes_expanded"] + 3


def test_shortest_vs_fastest_are_reported_separately(client, operator):
    fast = plan(client, operator, objective="fastest").json()
    short = plan(client, operator, objective="shortest").json()
    assert fast["comparison"]["fastest_time_s"] == short["comparison"]["fastest_time_s"]
    assert short["route"]["distance_m"] <= fast["route"]["distance_m"] + 0.01
    assert short["route"]["objective"] == "distance" and fast["route"]["objective"] == "time"


def test_fire_service_avoids_narrow_local_roads(client, operator):
    d = plan(client, operator, vehicle_type="fire_service", origin_intersection_id=1, destination_intersection_id=6).json()
    roads = {r["id"]: r for r in client.get("/api/roads").json()}
    assert all(roads[r["id"]]["road_type"] != "local" for r in d["route"]["roads"])


def test_vehicle_id_sets_origin_and_type(client, operator):
    r = client.post("/api/routes/emergency", json={"vehicle_id": 5, "destination_intersection_id": 16}, headers=operator).json()
    assert r["vehicle_type"] == "fire_service" and r["origin_intersection_id"] == 8


def test_input_errors(client, operator):
    assert plan(client, operator, destination_intersection_id=1).status_code == 422  # same origin and destination
    assert plan(client, operator, destination_intersection_id=999).status_code == 404
    assert client.post("/api/routes/emergency", json={"destination_intersection_id": 2}, headers=operator).status_code == 422
    assert client.get("/api/routes/999").status_code == 404


def test_closing_a_road_reroutes_active_route(client, operator):
    d = plan(client, operator, include_alternative=False).json()
    victim = d["route"]["roads"][1]["id"]
    inc = client.post("/api/incidents", json={"road_id": victim, "incident_type": "accident", "severity": "high"}, headers=operator).json()
    closed = client.post(f"/api/incidents/{inc['id']}/close-road", headers=operator).json()
    assert closed["rerouted_route_ids"] == [d["id"]]
    new = client.get(f"/api/routes/{d['id']}").json()
    assert new["status"] == "rerouted" and new["reroute_count"] == 1
    assert victim not in [r["id"] for r in new["route"]["roads"]]  # the new route avoids the closed road
    assert new["route"]["time_s"] >= d["route"]["time_s"]          # closing a road cannot make the best route faster
    # a brand-new route also avoids it
    fresh = plan(client, operator).json()
    assert victim not in [r["id"] for r in fresh["route"]["roads"]]


def test_manual_recalculate(client, operator, viewer):
    d = plan(client, operator).json()
    assert client.post(f"/api/routes/{d['id']}/recalculate", headers=viewer).status_code == 403
    r = client.post(f"/api/routes/{d['id']}/recalculate", headers=operator).json()
    assert r["changed"] is False and r["route"]["status"] == "active"


def test_route_cancelled_when_destination_is_cut_off(client, operator):
    # Intersection 1 (a corner) has exactly two roads; closing both isolates it
    d = plan(client, operator, origin_intersection_id=16, destination_intersection_id=1).json()
    corner_roads = [r["id"] for r in client.get("/api/roads").json() if 1 in (r["start_node_id"], r["end_node_id"])]
    assert len(corner_roads) == 3  # two grid roads + the Old Town Link diagonal
    for rid in corner_roads:
        inc = client.post("/api/incidents", json={"road_id": rid, "incident_type": "flooding", "severity": "critical"}, headers=operator).json()
        client.post(f"/api/incidents/{inc['id']}/close-road", headers=operator)
    assert client.get(f"/api/routes/{d['id']}").json()["status"] == "cancelled"
    assert plan(client, operator, origin_intersection_id=16, destination_intersection_id=1).status_code == 404
