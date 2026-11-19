"""Test fixtures: every test gets its own in-memory SQLite database seeded with a small simulated history."""
import os
import secrets
import sqlite3

os.environ.setdefault("SECRET_KEY", secrets.token_urlsafe(48))
os.environ.setdefault("ENVIRONMENT", "test")

from datetime import datetime, timezone  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import models  # noqa: E402,F401
from app.database.base import Base  # noqa: E402
from app.main import create_app  # noqa: E402
from app.seed import seed_database  # noqa: E402

PASSWORD = "Test-Password-123"
END_TIME = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="session")
def template_engine():
    """Seed ONE database for the whole run; each test gets a fast in-memory clone of it."""
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as db:
        seed_database(db, history_days=2, accident_count=400, seed=7, default_password=PASSWORD, end_time=END_TIME)
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(template_engine):
    clone = sqlite3.connect(":memory:", check_same_thread=False)
    template_engine.raw_connection().driver_connection.backup(clone)
    engine = create_engine("sqlite+pysqlite://", creator=lambda: clone, poolclass=StaticPool)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()
    clone.close()


@pytest.fixture(scope="session")
def trained_model_dir(tmp_path_factory):
    """A small real model, trained once per test run on simulated data."""
    from app.ml.train import road_metadata, save_artifact, train_model
    from app.simulation.generate_data import generate_history
    d = tmp_path_factory.mktemp("trained_model")
    raw = generate_history(days=5, end_time=END_TIME, seed=11).merge(road_metadata(), on="road_id")
    save_artifact(train_model(raw, 30, n_estimators=10), d)
    return d


@pytest.fixture()
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture()
def client(session_factory, tmp_path):
    app = create_app(session_factory=session_factory, model_dir=tmp_path / "no_model_yet")
    with TestClient(app) as c:
        yield c


def login(client: TestClient, role: str) -> dict:
    r = client.post("/api/auth/login", json={"email": f"{role}@flowsense.demo", "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return login(client, "admin")


@pytest.fixture()
def operator(client):
    return login(client, "operator")


@pytest.fixture()
def viewer(client):
    return login(client, "viewer")
