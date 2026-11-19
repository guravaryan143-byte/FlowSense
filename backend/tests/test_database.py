from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Incident, Road, TrafficRecord, User


def _road_kwargs(**over):
    base = dict(road_name="Test Road", start_node_id=1, end_node_id=2, length_m=500.0, lanes=2, speed_limit_kmh=40.0,
                road_type="collector", capacity=100, geometry=[[0, 0], [0, 1]])
    return {**base, **over}


def test_seed_populates_every_required_table(db):
    from app import models
    from sqlalchemy import func, select
    for m in (models.Intersection, models.Road, models.TrafficRecord, models.TrafficSignal, models.Incident,
              models.EmergencyVehicle, models.AccidentRecord, models.User):
        assert db.scalar(select(func.count()).select_from(m)) > 0, m.__name__


def test_duplicate_road_time_record_rejected(db):
    t = datetime(2030, 1, 1, tzinfo=timezone.utc)
    db.add(TrafficRecord(road_id=1, vehicle_count=1, average_speed=10, density=1, congestion_level="free_flow", recorded_at=t))
    db.commit()
    db.add(TrafficRecord(road_id=1, vehicle_count=2, average_speed=10, density=1, congestion_level="free_flow", recorded_at=t))
    with pytest.raises(IntegrityError):
        db.commit()


def test_road_constraints(db):
    for bad in ({"start_node_id": 1, "end_node_id": 1}, {"length_m": 0}, {"lanes": 0}, {"road_type": "dirt_track"}):
        db.rollback()
        db.add(Road(**_road_kwargs(**bad)))
        with pytest.raises(IntegrityError):
            db.commit()
    db.rollback()


def test_user_role_check_and_unique_email(db):
    db.add(User(name="x", email="viewer@flowsense.demo", password_hash="h", role="viewer"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(User(name="x", email="new@x.io", password_hash="h", role="superuser"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_incident_severity_check(db):
    db.add(Incident(incident_type="hazard", severity="apocalyptic", latitude=1, longitude=1))
    with pytest.raises(IntegrityError):
        db.commit()


def test_naive_datetimes_are_refused(db):
    db.add(TrafficRecord(road_id=2, vehicle_count=1, average_speed=10, density=1, congestion_level="free_flow", recorded_at=datetime(2030, 1, 1)))
    with pytest.raises(Exception):
        db.commit()


def test_datetimes_come_back_timezone_aware(db):
    from sqlalchemy import select
    rec = db.scalars(select(TrafficRecord).limit(1)).first()
    assert rec.recorded_at.tzinfo is not None


def test_seed_refuses_non_empty_database(db):
    from app.seed import seed_database
    with pytest.raises(RuntimeError):
        seed_database(db, history_days=1)


def test_reset_then_reseed_works_and_keeps_real_users(db):
    """Regression: --reset used to leave the demo users behind, so re-seeding crashed on the unique email."""
    from sqlalchemy import func, select
    from app.core.security import hash_password
    from app.seed import reset_all, seed_database
    db.add(User(name="Real Person", email="real@example.com", password_hash=hash_password("a-long-password"), role="viewer"))
    db.commit()
    reset_all(db)
    assert db.scalar(select(func.count()).select_from(Road)) == 0
    assert db.query(User).filter_by(email="real@example.com").count() == 1       # real accounts survive
    assert db.query(User).filter(User.email.like("%@flowsense.demo")).count() == 0
    seed_database(db, history_days=1, accident_count=50, default_password="Another-Pass-123")
    assert db.scalar(select(func.count()).select_from(Road)) == 28
    assert db.query(User).filter(User.email.like("%@flowsense.demo")).count() == 3


def test_failed_seed_leaves_nothing_behind(session_factory):
    """The seed is atomic: if it fails half-way, no partial city remains."""
    from sqlalchemy import func, select
    from app.models import Road
    from app.seed import reset_all, seed_database
    with session_factory() as db:
        reset_all(db)
        with pytest.raises(Exception):
            seed_database(db, history_days=1, accident_count=-5)   # an invalid accident count makes the accident insert fail part-way through
        db.rollback()
        assert db.scalar(select(func.count()).select_from(Road)) == 0
