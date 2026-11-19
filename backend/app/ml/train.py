"""Train, evaluate and persist the congestion model.

Usage (from backend/):  python -m app.ml.train [--csv ../datasets/traffic_synthetic.csv]
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from app.ml.features import FEATURE_COLUMNS, STEP_MINUTES, TARGET_COLUMNS, add_features
from app.simulation.network import build_sample_city

log = logging.getLogger("flowsense.ml")
MODEL_FILE = "congestion_model.joblib"
METRICS_FILE = "metrics.json"


def road_metadata() -> pd.DataFrame:
    _, roads = build_sample_city()
    return pd.DataFrame([{"road_id": r.id, "length_m": r.length_m, "lanes": r.lanes, "capacity": r.capacity,
                          "speed_limit_kmh": r.speed_limit_kmh, "road_type": r.road_type} for r in roads])


def load_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["recorded_at"])
    if df["recorded_at"].dt.tz is None:
        df["recorded_at"] = df["recorded_at"].dt.tz_localize("UTC")
    return df.merge(road_metadata(), on="road_id", how="left")


def chronological_split(feats: pd.DataFrame, horizon_minutes: int, test_fraction: float = 0.2):
    """Split by TIME, never at random.

    train: rows whose *target* time is still before the split point (purge gap = horizon),
    test : rows observed at or after the split point.
    A random split would let the model train on the future of the very series it is tested on.
    """
    feats = feats.dropna(subset=TARGET_COLUMNS)
    times = np.sort(feats["recorded_at"].unique())
    if len(times) < 10:
        raise ValueError("Not enough data to train and evaluate (need more history)")
    split_time = pd.Timestamp(times[int(len(times) * (1 - test_fraction))])
    if split_time.tzinfo is None:
        split_time = split_time.tz_localize("UTC")
    train = feats[feats["target_time"] <= split_time]
    test = feats[feats["recorded_at"] >= split_time]
    return train, test, split_time


def _metrics(y_true: pd.DataFrame, y_pred: np.ndarray) -> dict:
    out = {}
    for i, col in enumerate(TARGET_COLUMNS):
        yt, yp = y_true[col].to_numpy(), y_pred[:, i]
        out[col] = {
            "mae": round(float(mean_absolute_error(yt, yp)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(yt, yp))), 4),
            "r2": round(float(r2_score(yt, yp)), 4),
        }
    return out


def baseline_persistence(test: pd.DataFrame) -> np.ndarray:
    """'Nothing will change': predict the current density and speed."""
    return np.column_stack([test["density"], test["average_speed"]])


def baseline_historical_mean(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """Average of the TRAINING targets for the same road, hour of day and day of week."""
    def keys(d: pd.DataFrame) -> pd.DataFrame:
        k = pd.DataFrame({"road_id": d["road_id"].to_numpy(), "dow": d["target_dow"].to_numpy(),
                          "hour": d["target_time"].dt.hour.to_numpy()}, index=d.index)
        return k
    ktr, kte = keys(train), keys(test)
    table = pd.concat([ktr, train[TARGET_COLUMNS]], axis=1).groupby(["road_id", "dow", "hour"])[TARGET_COLUMNS].mean()
    joined = kte.join(table, on=["road_id", "dow", "hour"])
    for col in TARGET_COLUMNS:  # unseen combinations -> overall training mean
        joined[col] = joined[col].fillna(train[col].mean())
    return joined[TARGET_COLUMNS].to_numpy()


def train_model(raw: pd.DataFrame, horizon_minutes: int = 30, n_estimators: int = 100, random_state: int = 42,
                test_fraction: float = 0.2, max_depth: int | None = 16, min_samples_leaf: int = 20) -> dict:
    """Full pipeline: features -> chronological split -> fit -> evaluate vs baselines. Returns the artifact dict."""
    feats = add_features(raw, horizon_minutes)
    train, test, split_time = chronological_split(feats, horizon_minutes, test_fraction)
    if len(train) < 50 or len(test) < 10:
        raise ValueError("Not enough data to train and evaluate (need more history)")

    model = RandomForestRegressor(n_estimators=n_estimators, max_depth=max_depth, min_samples_leaf=min_samples_leaf,
                                  n_jobs=-1, random_state=random_state)
    model.fit(train[FEATURE_COLUMNS], train[TARGET_COLUMNS])
    pred = model.predict(test[FEATURE_COLUMNS])

    results = {
        "random_forest": _metrics(test[TARGET_COLUMNS], pred),
        "baseline_persistence": _metrics(test[TARGET_COLUMNS], baseline_persistence(test)),
        "baseline_historical_mean": _metrics(test[TARGET_COLUMNS], baseline_historical_mean(train, test)),
    }
    rf_mae = results["random_forest"]["target_density"]["mae"]
    pers_mae = results["baseline_persistence"]["target_density"]["mae"]
    importances = dict(sorted(zip(FEATURE_COLUMNS, map(float, model.feature_importances_)), key=lambda kv: -kv[1]))
    trained_at = datetime.now(timezone.utc)
    return {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "target_columns": TARGET_COLUMNS,
        "info": {
            "version": trained_at.strftime("rf-%Y%m%d%H%M%S"),
            "trained_at": trained_at.isoformat(),
            "horizon_minutes": horizon_minutes,
            "step_minutes": STEP_MINUTES,
            "n_train": int(len(train)),
            "n_test": int(len(test)),
            "split_time": split_time.isoformat(),
            "data_source": "simulated",
            "n_estimators": n_estimators,
            "metrics": results,
            "density_mae_improvement_vs_persistence_pct": round((pers_mae - rf_mae) / pers_mae * 100, 1) if pers_mae else None,
            "feature_importances": {k: round(v, 4) for k, v in importances.items()},
            "units": {"density": "vehicles/km/lane", "speed": "km/h"},
        },
        "test_frame": test.assign(pred_density=pred[:, 0], pred_speed=pred[:, 1]),
    }


def save_artifact(artifact: dict, model_dir: Path) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / MODEL_FILE
    joblib.dump({k: artifact[k] for k in ("model", "feature_columns", "target_columns", "info")}, path, compress=3)
    (model_dir / METRICS_FILE).write_text(json.dumps(artifact["info"], indent=2))
    return path


def main() -> None:
    from app.core.config import get_settings
    from app.ml.evaluate import save_plots

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    s = get_settings()
    p = argparse.ArgumentParser(description="Train the FlowSense congestion model")
    p.add_argument("--csv", type=Path, default=s.dataset_path)
    p.add_argument("--horizon", type=int, default=s.prediction_horizon_minutes)
    p.add_argument("--trees", type=int, default=100)
    p.add_argument("--plots-dir", type=Path, default=Path("../docs/ml"))
    args = p.parse_args()
    if not args.csv.exists():
        raise SystemExit(f"Dataset not found: {args.csv}\nGenerate it first:  python -m app.simulation.generate_data")
    artifact = train_model(load_dataset(args.csv), args.horizon, args.trees)
    path = save_artifact(artifact, s.model_dir)
    save_plots(artifact, args.plots_dir)
    info = artifact["info"]
    print(f"Saved model to {path}")
    print(f"Train rows {info['n_train']:,} | test rows {info['n_test']:,} | split at {info['split_time']}")
    for name, m in info["metrics"].items():
        d, v = m["target_density"], m["target_speed"]
        print(f"  {name:26s} density MAE {d['mae']:6.3f} RMSE {d['rmse']:6.3f} R2 {d['r2']:.3f} | speed MAE {v['mae']:6.3f} RMSE {v['rmse']:6.3f} R2 {v['r2']:.3f}")
    print(f"Density MAE vs persistence baseline: {info['density_mae_improvement_vs_persistence_pct']}% better (negative = worse)")


if __name__ == "__main__":
    main()
