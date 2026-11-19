def test_accident_list_pagination_and_filters(client):
    page = client.get("/api/accidents?limit=50").json()
    assert page["total"] == 400 and len(page["items"]) == 50
    assert all(a["data_source"] == "simulated" for a in page["items"])
    crit = client.get("/api/accidents?severity=critical&limit=1000").json()
    assert crit["total"] == len(crit["items"]) and all(a["severity"] == "critical" for a in crit["items"])
    assert 0 < crit["total"] < 400
    assert client.get("/api/accidents?severity=nope").status_code == 422


def test_date_filter(client):
    everything = client.get("/api/accidents").json()["total"]
    recent = client.get("/api/accidents?date_from=2026-06-01T00:00:00").json()["total"]
    none = client.get("/api/accidents?date_from=2030-01-01T00:00:00Z").json()["total"]
    assert 0 < recent < everything and none == 0


def test_hotspots_are_descriptive_and_ranked(client):
    d = client.get("/api/accidents/hotspots").json()
    assert "not a prediction" in d["disclaimer"] and d["data_source"] == "simulated"
    assert 3 <= len(d["hotspots"]) <= 8
    hs = d["hotspots"]
    assert [h["rank"] for h in hs] == list(range(1, len(hs) + 1))
    assert [h["severity_score"] for h in hs] == sorted((h["severity_score"] for h in hs), reverse=True)
    assert d["clustered_accidents"] + d["noise_accidents"] == d["accidents_analysed"] == 400
    assert all(h["nearest_road"] and h["radius_m"] <= 400 for h in hs)


def test_hotspot_filters_change_results(client):
    all_ = client.get("/api/accidents/hotspots").json()
    severe = client.get("/api/accidents/hotspots?severity=critical&min_samples=3").json()
    assert severe["accidents_analysed"] < all_["accidents_analysed"]
    assert client.get("/api/accidents/hotspots?eps_m=5").status_code == 422


def test_accident_analytics_totals_add_up(client):
    a = client.get("/api/accidents/analytics").json()
    assert a["total"] == sum(a["by_severity"].values()) == sum(a["by_type"].values()) == sum(a["by_hour"]) == sum(m["count"] for m in a["by_month"]) == 400
    assert len(a["by_hour"]) == 24
    filtered = client.get("/api/accidents/analytics?severity=high").json()
    assert filtered["total"] == a["by_severity"]["high"]


def test_overview_matches_live_traffic(client):
    live = client.get("/api/traffic/live").json()["summary"]
    o = client.get("/api/analytics/overview").json()
    assert o["data_source"] == "simulated"
    assert o["roads_total"] == 28 and o["total_vehicles"] == live["total_vehicles"] and o["congested_roads"] == live["congested_roads"]
    assert o["active_incidents"] == 3  # 4 seeded, 1 of them resolved
    assert sum(o["congestion_distribution"].values()) == 28
    assert o["simulation"]["running"] is False


def test_overview_signal_and_emergency_sections_reflect_real_activity(client, viewer, operator):
    empty = client.get("/api/analytics/overview").json()
    assert empty["signal_performance"]["runs"] == 0 and empty["emergency"]["active_routes"] == 0
    client.post("/api/signals/optimize", json={"intersection_id": 2, "scenario": "ns_heavy", "duration_s": 600}, headers=viewer)
    client.post("/api/routes/emergency", json={"vehicle_type": "ambulance", "origin_intersection_id": 1, "destination_intersection_id": 9}, headers=operator)
    o = client.get("/api/analytics/overview").json()
    assert o["signal_performance"]["runs"] == 1 and o["signal_performance"]["last_run"]["scenario"] == "ns_heavy"
    assert o["emergency"]["active_routes"] == 1 and o["emergency"]["average_eta_s"] > 0


def test_trends(client):
    t = client.get("/api/analytics/traffic-trends?hours=12").json()
    assert t["data_source"] == "simulated" and len(t["series"]) == 48
    assert [p["time"] for p in t["series"]] == sorted(p["time"] for p in t["series"])
    assert len(t["hourly_pattern"]) == 24 and "previous_week" in t["comparison"]
    assert all(0 <= p["congested_roads"] <= 28 for p in t["series"])
    assert client.get("/api/analytics/traffic-trends?hours=500").status_code == 422
