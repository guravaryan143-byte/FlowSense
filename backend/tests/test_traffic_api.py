import pytest

from app.simulation.engine import classify_occupancy, demand_profile
from datetime import datetime, timezone


def test_roads_and_intersections(client):
    roads = client.get("/api/roads").json()
    nodes = client.get("/api/intersections").json()
    assert len(roads) == 28 and len(nodes) == 16
    ids = {n["id"] for n in nodes}
    assert all(r["start_node_id"] in ids and r["end_node_id"] in ids and len(r["geometry"]) >= 2 for r in roads)


def test_live_traffic_is_labelled_simulated_and_consistent(client):
    d = client.get("/api/traffic/live").json()
    assert d["data_source"] == "simulated" and "SIMULATED" in d["notice"]
    assert len(d["roads"]) == 28
    s = d["summary"]
    assert s["total_vehicles"] == sum(r["vehicle_count"] for r in d["roads"])
    assert s["road_count"] == 28 and sum(s["level_counts"].values()) == 28
    assert all(r["data_source"] == "simulated" for r in d["roads"])
    assert {r["congestion_level"] for r in d["roads"]} <= {"free_flow", "moderate", "heavy", "severe", "closed"}


def test_single_road_and_404(client):
    r = client.get("/api/traffic/5").json()
    assert r["road_id"] == 5 and 0 <= r["occupancy"] <= 1
    missing = client.get("/api/traffic/999")
    assert missing.status_code == 404 and missing.json()["error"] == "not_found"


def test_history_window_and_pagination(client):
    page = client.get("/api/traffic/history/5?hours=6").json()
    assert page["total"] == 24  # 6 h of 15-minute records
    times = [p["recorded_at"] for p in page["items"]]
    assert times == sorted(times)
    second = client.get("/api/traffic/history/5?hours=6&limit=10&offset=10").json()
    assert len(second["items"]) == 10 and second["items"][0] == page["items"][10]
    assert client.get("/api/traffic/history/5?hours=0").status_code == 422
    assert client.get("/api/traffic/history/999").status_code == 404


@pytest.mark.parametrize("occ,level", [(0.0, "free_flow"), (0.249, "free_flow"), (0.25, "moderate"), (0.499, "moderate"),
                                       (0.50, "heavy"), (0.749, "heavy"), (0.75, "severe"), (1.0, "severe")])
def test_congestion_classification_boundaries(occ, level):
    assert classify_occupancy(occ) == level


def test_demand_profile_has_rush_hours():
    day = lambda h: demand_profile(datetime(2026, 11, 2, h, 0, tzinfo=timezone.utc))  # a Monday
    assert day(8) > 2 * day(3) and day(18) > 2 * day(3) and day(18) > day(13)
    sat = lambda h: demand_profile(datetime(2026, 11, 7, h, 0, tzinfo=timezone.utc))
    assert sat(8) < day(8)  # weekends have no morning commute peak
