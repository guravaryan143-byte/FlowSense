import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import login


def test_without_model_everything_degrades_gracefully(client, viewer):
    o = client.get("/api/predictions/overview")
    assert o.status_code == 200 and o.json()["model_available"] is False and o.json()["predictions"] == []
    info = client.get("/api/predictions/model-info").json()
    assert info["available"] is False and "train" in info["message"].lower()
    r = client.post("/api/predictions", json={}, headers=viewer)
    assert r.status_code == 503 and r.json()["error"] == "model_not_trained"
    assert client.get("/api/predictions/3").json()["latest"] is None
    assert client.get("/api/analytics/overview").json()["prediction"]["model_available"] is False


@pytest.fixture()
def model_client(session_factory, trained_model_dir):
    with TestClient(create_app(session_factory=session_factory, model_dir=trained_model_dir)) as c:
        yield c


def test_overview_with_model(model_client):
    o = model_client.get("/api/predictions/overview").json()
    assert o["model_available"] is True and o["horizon_minutes"] == 30 and len(o["predictions"]) == 28
    p = o["predictions"][0]
    assert p["congestion_level"] in ("free_flow", "moderate", "heavy", "severe") and p["predicted_density"] >= 0
    assert 0 < p["predicted_speed"] <= 60
    assert sum(v for k, v in o["summary"].items() if k in ("free_flow", "moderate", "heavy", "severe")) == 28


def test_model_info_contains_real_metrics(model_client):
    info = model_client.get("/api/predictions/model-info").json()["info"]
    m = info["metrics"]["random_forest"]["target_density"]
    assert {"mae", "rmse", "r2"} <= set(m) and info["data_source"] == "simulated"


def test_post_requires_login_and_persists(model_client, session_factory):
    assert model_client.post("/api/predictions", json={}).status_code == 401
    h = login(model_client, "viewer")
    r = model_client.post("/api/predictions", json={"road_ids": [1, 2, 3]}, headers=h)
    assert r.status_code == 200 and [p["road_id"] for p in r.json()] == [1, 2, 3]
    stored = model_client.get("/api/predictions/2").json()
    assert len(stored["history"]) == 1 and stored["latest"]["road_id"] == 2


def test_post_without_persist_stores_nothing(model_client):
    h = login(model_client, "viewer")
    model_client.post("/api/predictions", json={"road_ids": [4], "persist": False}, headers=h)
    assert model_client.get("/api/predictions/4").json()["history"] == []


def test_unknown_road_is_404(model_client):
    h = login(model_client, "viewer")
    assert model_client.post("/api/predictions", json={"road_ids": [999]}, headers=h).status_code == 404
    assert model_client.get("/api/predictions/999").status_code == 404
