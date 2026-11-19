"""Congestion predictions: build features from recent records, run the model, persist if asked."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.ml.features import FEATURE_COLUMNS, STEP_MINUTES, latest_feature_rows
from app.ml.model_store import ModelStore
from app.models import Road, TrafficPrediction, TrafficRecord
from app.simulation.engine import classify_occupancy
from app.simulation.network import JAM_DENSITY_PER_LANE_KM

HISTORY_STEPS = 8  # 2 hours of 15-minute records: plenty for lag-4 and rolling features


def _history_frame(db: Session, roads: list[Road]) -> pd.DataFrame:
    latest = db.scalar(select(func.max(TrafficRecord.recorded_at)))
    if latest is None:
        return pd.DataFrame()
    since = latest - timedelta(minutes=STEP_MINUTES * HISTORY_STEPS)
    ids = [r.id for r in roads]
    rows = db.execute(
        select(TrafficRecord.road_id, TrafficRecord.recorded_at, TrafficRecord.vehicle_count, TrafficRecord.average_speed)
        .where(TrafficRecord.road_id.in_(ids), TrafficRecord.recorded_at >= since)
    ).all()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["road_id", "recorded_at", "vehicle_count", "average_speed"])
    meta = pd.DataFrame([{"road_id": r.id, "length_m": r.length_m, "lanes": r.lanes, "capacity": r.capacity,
                          "speed_limit_kmh": r.speed_limit_kmh, "road_type": r.road_type} for r in roads])
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True)
    return df.merge(meta, on="road_id")


def predict(db: Session, store: ModelStore, road_ids: list[int] | None = None, persist: bool = False) -> list[dict]:
    """Return one prediction per road. Raises ModelNotTrainedError when no model exists."""
    artifact = store.get()
    info = artifact["info"]
    q = select(Road).order_by(Road.id)
    if road_ids:
        q = q.where(Road.id.in_(road_ids))
    roads = list(db.scalars(q))
    if road_ids and len(roads) != len(set(road_ids)):
        missing = sorted(set(road_ids) - {r.id for r in roads})
        raise NotFoundError(f"Unknown road id(s): {missing}")
    hist = _history_frame(db, roads)
    if hist.empty:
        return []

    feats = latest_feature_rows(hist, info["horizon_minutes"])
    pred = artifact["model"].predict(feats[FEATURE_COLUMNS])
    by_id = {r.id: r for r in roads}
    now = datetime.now(timezone.utc)
    out: list[dict] = []
    order = feats["road_id"].argsort(kind="stable").to_numpy()  # stable, road-id ordered API output
    feats, pred = feats.iloc[order].reset_index(drop=True), pred[order]
    for (_, row), (dens, spd) in zip(feats.iterrows(), pred):
        road = by_id[int(row["road_id"])]
        dens = float(min(max(dens, 0.0), JAM_DENSITY_PER_LANE_KM))
        spd = float(min(max(spd, 2.0), road.speed_limit_kmh))
        occ = dens / JAM_DENSITY_PER_LANE_KM
        out.append({
            "road_id": road.id, "road_name": road.road_name,
            "current_density": round(float(row["density"]), 2), "current_speed": round(float(row["average_speed"]), 1),
            "current_level": classify_occupancy(float(row["occupancy"])),
            "predicted_density": round(dens, 2), "predicted_speed": round(spd, 1),
            "predicted_occupancy": round(occ, 4), "congestion_level": classify_occupancy(occ),
            "horizon_minutes": info["horizon_minutes"], "target_time": row["target_time"].to_pydatetime(),
            "predicted_at": now, "model_version": info["version"],
        })
    if persist:
        db.add_all(TrafficPrediction(
            road_id=p["road_id"], predicted_density=p["predicted_density"], predicted_speed=p["predicted_speed"],
            congestion_level=p["congestion_level"], horizon_minutes=p["horizon_minutes"], target_time=p["target_time"],
            model_version=p["model_version"], predicted_at=p["predicted_at"]) for p in out)
        db.commit()
    return out


def overview(db: Session, store: ModelStore) -> dict:
    if not store.is_available():
        return {"model_available": False, "message": "Model not trained yet. Run: python -m app.ml.train",
                "horizon_minutes": None, "summary": {}, "predictions": []}
    preds = predict(db, store, persist=False)
    summary = {k: 0 for k in ("free_flow", "moderate", "heavy", "severe")}
    for p in preds:
        summary[p["congestion_level"]] += 1
    summary["predicted_congested_roads"] = summary["heavy"] + summary["severe"]
    return {"model_available": True, "message": None, "horizon_minutes": store.info()["horizon_minutes"],
            "summary": summary, "predictions": preds}


def road_prediction(db: Session, store: ModelStore, road_id: int, history_limit: int = 50) -> dict:
    if db.get(Road, road_id) is None:
        raise NotFoundError(f"Road {road_id} not found")
    history = list(db.scalars(select(TrafficPrediction).where(TrafficPrediction.road_id == road_id)
                              .order_by(TrafficPrediction.predicted_at.desc()).limit(history_limit)))
    available = store.is_available()
    latest = predict(db, store, [road_id])[0] if available and db.scalar(select(func.count()).select_from(TrafficRecord).where(TrafficRecord.road_id == road_id)) else None
    return {"road_id": road_id, "model_available": available, "latest": latest, "history": history}


def model_info(store: ModelStore) -> dict:
    info = store.info()
    if info is None:
        return {"available": False, "message": "Model not trained yet. Run: python -m app.ml.train", "info": None}
    return {"available": True, "message": None, "info": info}
