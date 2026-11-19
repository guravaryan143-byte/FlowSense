import time
from datetime import datetime, timezone

import pytest

from app.simulation.engine import TrafficSimulator
from app.simulation.network import JAM_DENSITY_PER_LANE_KM, sample_network

T0 = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)


def test_sample_network_is_valid_and_connected():
    nodes, roads, net = sample_network()
    assert len(nodes) == 16 and len(roads) == 28
    ids = {n.id for n in nodes}
    assert all(r.start_id in ids and r.end_id in ids and r.start_id != r.end_id for r in roads)
    assert all(r.capacity == round(JAM_DENSITY_PER_LANE_KM * r.length_m / 1000 * r.lanes) for r in roads)
    assert len({r.name for r in roads}) == 28
    seen, stack = set(), [1]
    adj = {}
    for r in roads:
        adj.setdefault(r.start_id, set()).add(r.end_id)
        adj.setdefault(r.end_id, set()).add(r.start_id)
    while stack:
        n = stack.pop()
        if n not in seen:
            seen.add(n)
            stack.extend(adj[n])
    assert seen == ids


def test_simulation_is_reproducible_and_bounded():
    _, _, net = sample_network()
    runs = []
    for _ in range(2):
        sim = TrafficSimulator(net, seed=5)
        for i in range(60):
            states = sim.step(T0, 5.0)
        runs.append({k: v.vehicle_count for k, v in states.items()})
    assert runs[0] == runs[1]
    for rid, road in net.roads.items():
        assert 0 <= runs[0][rid] <= road.capacity


def test_rush_hour_is_busier_than_night():
    _, _, net = sample_network()
    def total(hour):
        sim = TrafficSimulator(net, seed=2)
        for i in range(80):
            states = sim.step(datetime(2026, 11, 2, hour, 0, tzinfo=timezone.utc), 5.0)
        return sum(s.vehicle_count for s in states.values())
    assert total(8) > 1.5 * total(3)


def test_closed_road_empties_and_neighbours_absorb_demand():
    _, _, net = sample_network()
    sim = TrafficSimulator(net, seed=1)
    for _ in range(40):
        sim.step(T0, 5.0)
    states = sim.step(T0, 5.0, closed={5})
    assert states[5].vehicle_count == 0 and states[5].average_speed > 0


def test_incident_reduces_speed_on_that_road():
    _, _, net = sample_network()
    a, b = TrafficSimulator(net, seed=3), TrafficSimulator(net, seed=3)
    for _ in range(30):
        sa = a.step(T0, 5.0)
        sb = b.step(T0, 5.0, capacity_factor={7: 0.4})
    assert sb[7].average_speed < sa[7].average_speed


def test_vehicles_are_conserved_apart_from_entries_and_exits():
    """With no demand, no vehicle can appear: the total may only fall."""
    _, _, net = sample_network()
    sim = TrafficSimulator(net, seed=4, demand_multiplier=0.0, initial_occupancy=0.3)
    before = sum(sim.vehicles.values())
    for _ in range(10):
        sim.step(T0, 5.0)
        after = sum(sim.vehicles.values())
        assert after <= before + 1e-6
        before = after


def test_adaptive_signal_controller_respects_limits():
    _, _, net = sample_network()
    sim = TrafficSimulator(net, seed=1, signal_mode="adaptive")
    for _ in range(50):
        sim.step(T0, 5.0)
    for greens in sim.signals.greens.values():
        assert all(10 <= g <= 60 for g in greens.values())


# ---- lifecycle through the API -------------------------------------------------------------
def test_start_stop_lifecycle(client, operator, viewer):
    assert client.post("/api/simulation/start", json={}, headers=viewer).status_code == 403
    assert client.get("/api/simulation/status").json()["running"] is False
    r = client.post("/api/simulation/start", json={"tick_interval_s": 0.2, "signal_mode": "adaptive"}, headers=operator)
    assert r.status_code == 200 and r.json()["running"] is True
    assert client.post("/api/simulation/start", json={}, headers=operator).status_code == 409  # never two loops
    deadline = time.time() + 5
    while time.time() < deadline and client.get("/api/simulation/status").json()["tick"] < 3:
        time.sleep(0.1)
    st = client.get("/api/simulation/status").json()
    assert st["tick"] >= 3 and st["signal_mode"] == "adaptive" and st["data_source"] == "simulated"
    stopped = client.post("/api/simulation/stop", headers=operator).json()
    assert stopped["running"] is False
    ticks = stopped["tick"]
    time.sleep(0.6)
    assert client.get("/api/simulation/status").json()["tick"] == ticks  # really stopped, nothing keeps running
    assert client.post("/api/simulation/stop", headers=operator).json()["running"] is False  # idempotent


def test_simulation_writes_new_records_and_signal_state(client, operator, session_factory):
    from sqlalchemy import func, select
    from app.models import TrafficRecord, TrafficSignal
    with session_factory() as db:
        before = db.scalar(select(func.count()).select_from(TrafficRecord))
    client.post("/api/simulation/start", json={"tick_interval_s": 0.2}, headers=operator)
    deadline = time.time() + 6
    while time.time() < deadline and client.get("/api/simulation/status").json()["tick"] < 4:
        time.sleep(0.1)
    client.post("/api/simulation/stop", headers=operator)
    with session_factory() as db:
        after = db.scalar(select(func.count()).select_from(TrafficRecord))
        sigs = db.scalars(select(TrafficSignal)).all()
    assert after > before and (after - before) % 28 == 0  # whole 28-road snapshots
    assert all(s.current_phase in ("NS", "EW") for s in sigs)


def test_websocket_streams_snapshot_then_updates(client, operator):
    with client.websocket_connect("/ws/traffic") as ws:
        first = ws.receive_json()
        assert first["type"] == "snapshot" and first["data_source"] == "simulated" and len(first["roads"]) == 28
        assert ws.receive_json()["type"] == "status"
        client.post("/api/simulation/start", json={"tick_interval_s": 0.2}, headers=operator)
        msg = ws.receive_json()
        while msg["type"] != "traffic_update":
            msg = ws.receive_json()
        assert msg["data_source"] == "simulated" and len(msg["roads"]) == 28 and msg["tick"] >= 1
        assert {"road_id", "vehicle_count", "average_speed", "congestion_level"} <= set(msg["roads"][0])
        assert len(msg["signals"]) == 16
        client.post("/api/simulation/stop", headers=operator)


def test_websocket_rejects_foreign_origin(client):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/traffic", headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()


def test_start_on_empty_database_fails_cleanly(tmp_path):
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.main import create_app
    from tests.conftest import PASSWORD
    from app.models import User
    from app.core.security import hash_password
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    f = sessionmaker(bind=engine, expire_on_commit=False)
    with f() as db:
        db.add(User(name="op", email="op@x.io", password_hash=hash_password(PASSWORD), role="operator"))
        db.commit()
    with TestClient(create_app(session_factory=f)) as c:
        tok = c.post("/api/auth/login", json={"email": "op@x.io", "password": PASSWORD}).json()["access_token"]
        r = c.post("/api/simulation/start", json={}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 409 and "seed" in r.json()["message"]
        assert c.get("/api/simulation/status").json()["running"] is False
