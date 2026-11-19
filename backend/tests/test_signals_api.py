def test_list_and_detail(client):
    sigs = client.get("/api/signals").json()
    assert len(sigs) == 16
    s = sigs[0]
    assert s["fixed_baseline"]["ns_green_s"] == s["fixed_baseline"]["ew_green_s"] == 41.0
    assert 10 <= s["recommended"]["ns_green_s"] <= 60 and 10 <= s["recommended"]["ew_green_s"] <= 60
    d = client.get(f"/api/signals/{s['intersection_id']}").json()
    assert d["approaches"] and all(a["phase"] in ("NS", "EW") for a in d["approaches"])
    assert client.get("/api/signals/999").status_code == 404


def test_optimize_compares_strategies_under_identical_arrivals(client, viewer):
    r = client.post("/api/signals/optimize", json={"intersection_id": 7, "scenario": "shifting", "duration_s": 1800, "seed": 3}, headers=viewer)
    assert r.status_code == 200
    d = r.json()
    assert d["fixed"]["vehicles_arrived"] == d["adaptive"]["vehicles_arrived"]
    assert d["applied"] is False and "simulated" in d["notice"].lower()
    imp = d["improvement"]
    assert imp["verdict"] and (imp["wait_reduction_pct"] is None or isinstance(imp["wait_reduction_pct"], float))
    assert len(d["fixed"]["queue_series"]) > 5


def test_optimize_requires_login_and_validates(client, viewer):
    assert client.post("/api/signals/optimize", json={"intersection_id": 1}).status_code == 401
    assert client.post("/api/signals/optimize", json={"intersection_id": 1, "scenario": "chaos"}, headers=viewer).status_code == 422
    assert client.post("/api/signals/optimize", json={"intersection_id": 1, "duration_s": 5}, headers=viewer).status_code == 422
    assert client.post("/api/signals/optimize", json={"intersection_id": 999}, headers=viewer).status_code == 404


def test_apply_needs_operator_and_respects_limits(client, viewer, operator):
    body = {"intersection_id": 7, "scenario": "ns_heavy", "duration_s": 900, "apply": True}
    assert client.post("/api/signals/optimize", json=body, headers=viewer).status_code == 403
    assert client.get("/api/signals/7").json()["mode"] == "fixed"  # the rejected request changed nothing
    assert client.post("/api/signals/optimize", json=body, headers=operator).status_code == 200
    s = client.get("/api/signals/7").json()
    assert s["mode"] == "adaptive"
    assert 10 <= s["current"]["ns_green_s"] <= 60 and 10 <= s["current"]["ew_green_s"] <= 60
    assert s["last_run"]["applied"] is True


def test_reset_to_fixed(client, operator, viewer):
    client.post("/api/signals/optimize", json={"intersection_id": 3, "apply": True, "duration_s": 600}, headers=operator)
    assert client.post("/api/signals/3/reset", headers=viewer).status_code == 403
    d = client.post("/api/signals/3/reset", headers=operator).json()
    assert d["mode"] == "fixed" and d["current"]["ns_green_s"] == d["current"]["ew_green_s"] == 41.0
