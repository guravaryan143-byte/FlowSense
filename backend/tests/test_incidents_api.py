VALID = {"road_id": 5, "incident_type": "accident", "severity": "high", "description": "Two cars collided"}


def test_viewer_can_report_but_anonymous_cannot(client, viewer):
    assert client.post("/api/incidents", json=VALID).status_code == 401
    r = client.post("/api/incidents", json=VALID, headers=viewer)
    assert r.status_code == 201
    d = r.json()
    assert d["status"] == "reported" and d["road_name"] and d["closes_road"] is False and d["reported_by"]
    assert d["created_at"] and d["latitude"] and d["longitude"]  # location taken from the road when not supplied


def test_validation(client, viewer):
    bad = [
        {**VALID, "road_id": None},                                    # no location at all
        {**VALID, "incident_type": "alien_invasion"},
        {**VALID, "severity": "catastrophic"},
        {**VALID, "description": "x" * 1001},
        {"incident_type": "hazard", "severity": "low", "latitude": 95, "longitude": 10},
    ]
    for body in bad:
        assert client.post("/api/incidents", json=body, headers=viewer).status_code == 422, body
    assert client.post("/api/incidents", json={**VALID, "road_id": 999}, headers=viewer).status_code == 404


def test_report_by_coordinates_without_road(client, viewer):
    r = client.post("/api/incidents", json={"incident_type": "hazard", "severity": "low", "latitude": 18.52, "longitude": 73.85}, headers=viewer)
    assert r.status_code == 201 and r.json()["road_id"] is None


def test_control_characters_are_stripped(client, viewer):
    r = client.post("/api/incidents", json={**VALID, "description": "  oil\x00 spill\x07  "}, headers=viewer).json()
    assert r["description"] == "oil spill"


def test_list_filters_and_pagination(client, viewer):
    for _ in range(3):
        client.post("/api/incidents", json=VALID, headers=viewer)
    everything = client.get("/api/incidents?limit=100").json()
    assert everything["total"] == 7 and len(everything["items"]) == 7  # 4 seeded + 3 new
    active = client.get("/api/incidents?active_only=true").json()
    assert all(i["status"] != "resolved" for i in active["items"]) and active["total"] == 6
    assert client.get("/api/incidents?status=resolved").json()["total"] == 1
    assert client.get("/api/incidents?limit=2&offset=2").json()["items"][0]["id"] == everything["items"][2]["id"]
    assert client.get("/api/incidents?status=bogus").status_code == 422


def test_only_operators_update_status(client, viewer, operator):
    inc = client.post("/api/incidents", json=VALID, headers=viewer).json()
    assert client.patch(f"/api/incidents/{inc['id']}", json={"status": "verified"}, headers=viewer).status_code == 403
    r = client.patch(f"/api/incidents/{inc['id']}", json={"status": "verified", "severity": "critical"}, headers=operator)
    assert r.status_code == 200 and r.json()["status"] == "verified" and r.json()["severity"] == "critical"
    assert client.patch("/api/incidents/9999", json={"status": "verified"}, headers=operator).status_code == 404


def test_status_transitions_are_enforced(client, operator):
    inc = client.post("/api/incidents", json=VALID, headers=operator).json()
    url = f"/api/incidents/{inc['id']}"
    assert client.patch(url, json={"status": "resolved"}, headers=operator).json()["resolved_at"]
    # resolved incidents may be re-opened to in_progress but not set back to 'reported'
    assert client.patch(url, json={"status": "reported"}, headers=operator).status_code == 409
    reopened = client.patch(url, json={"status": "in_progress"}, headers=operator).json()
    assert reopened["status"] == "in_progress" and reopened["resolved_at"] is None


def test_close_road_updates_network_and_traffic(client, operator, viewer):
    inc = client.post("/api/incidents", json={**VALID, "road_id": 8}, headers=operator).json()
    assert client.post(f"/api/incidents/{inc['id']}/close-road", headers=viewer).status_code == 403
    r = client.post(f"/api/incidents/{inc['id']}/close-road", headers=operator)
    assert r.status_code == 200 and r.json()["incident"]["closes_road"] is True
    assert next(x for x in client.get("/api/roads").json() if x["id"] == 8)["is_closed"] is True
    assert client.get("/api/traffic/8").json()["congestion_level"] == "closed"
    live = client.get("/api/traffic/live").json()
    assert live["summary"]["level_counts"]["closed"] == 1 and live["summary"]["open_roads"] == 27


def test_resolving_reopens_the_road(client, operator):
    inc = client.post("/api/incidents", json={**VALID, "road_id": 8}, headers=operator).json()
    client.post(f"/api/incidents/{inc['id']}/close-road", headers=operator)
    client.patch(f"/api/incidents/{inc['id']}", json={"status": "resolved"}, headers=operator)
    assert next(x for x in client.get("/api/roads").json() if x["id"] == 8)["is_closed"] is False


def test_road_stays_closed_while_another_incident_still_closes_it(client, operator):
    a = client.post("/api/incidents", json={**VALID, "road_id": 8}, headers=operator).json()
    b = client.post("/api/incidents", json={**VALID, "road_id": 8, "incident_type": "flooding"}, headers=operator).json()
    for i in (a, b):
        client.post(f"/api/incidents/{i['id']}/close-road", headers=operator)
    client.patch(f"/api/incidents/{a['id']}", json={"status": "resolved"}, headers=operator)
    assert next(x for x in client.get("/api/roads").json() if x["id"] == 8)["is_closed"] is True
    client.patch(f"/api/incidents/{b['id']}", json={"status": "resolved"}, headers=operator)
    assert next(x for x in client.get("/api/roads").json() if x["id"] == 8)["is_closed"] is False


def test_cannot_close_road_without_road_or_when_resolved(client, operator):
    no_road = client.post("/api/incidents", json={"incident_type": "hazard", "severity": "low", "latitude": 18.5, "longitude": 73.8}, headers=operator).json()
    assert client.post(f"/api/incidents/{no_road['id']}/close-road", headers=operator).status_code == 422
    done = client.post("/api/incidents", json=VALID, headers=operator).json()
    client.patch(f"/api/incidents/{done['id']}", json={"status": "resolved"}, headers=operator)
    assert client.post(f"/api/incidents/{done['id']}/close-road", headers=operator).status_code == 409
