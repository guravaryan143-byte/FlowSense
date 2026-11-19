"""Feature engineering shared by TRAINING and INFERENCE (one code path => no train/serve skew).

Prediction task: given what we know at time t for a road, predict its density and speed at t + horizon.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ROAD_TYPE_ORDER = {"local": 0, "collector": 1, "arterial": 2}
STEP_MINUTES = 15

FEATURE_COLUMNS = [
    "vehicle_count", "average_speed", "density", "occupancy", "speed_ratio",
    "occ_lag1", "occ_lag4", "speed_lag1", "occ_roll4", "occ_trend",
    "capacity", "length_m", "lanes", "speed_limit_kmh", "road_type_code",
    "target_hour_sin", "target_hour_cos", "target_dow", "target_is_weekend",
]
TARGET_COLUMNS = ["target_density", "target_speed"]
META_COLUMNS = ["road_id", "length_m", "lanes", "capacity", "speed_limit_kmh", "road_type"]


def clean_observations(df: pd.DataFrame) -> pd.DataFrame:
    """Missing-value handling for raw sensor readings. Uses ONLY past information (no leakage).

    1. sort by road and time; negative readings are impossible -> treated as missing;
    2. forward-fill short gaps (at most 2 steps = 30 min) within each road;
    3. fill what remains with the road's expanding median of its own earlier readings;
    4. very first readings of a road: domain priors (10 % of capacity, 80 % of the speed limit).
    """
    out = df.sort_values(["road_id", "recorded_at"]).reset_index(drop=True).copy()
    priors = {"vehicle_count": 0.10 * out["capacity"], "average_speed": 0.80 * out["speed_limit_kmh"]}
    for col in ("vehicle_count", "average_speed"):
        out.loc[out[col] < 0, col] = np.nan
        filled = out.groupby("road_id")[col].transform(lambda s: s.ffill(limit=2))
        past_median = out.groupby("road_id")[col].transform(lambda s: s.shift(1).expanding(min_periods=1).median())
        out[col] = filled.fillna(past_median).fillna(priors[col])
    return out


def add_features(df: pd.DataFrame, horizon_minutes: int = 30, with_target: bool = True) -> pd.DataFrame:
    """Add engineered columns. `df` needs META_COLUMNS + recorded_at, vehicle_count, average_speed.

    All lag/rolling features look only at the PAST of each road (shift/rolling with trailing windows).
    Time-of-day features describe the TARGET time (t + horizon), because that is the moment we forecast.
    """
    if horizon_minutes % STEP_MINUTES:
        raise ValueError(f"horizon_minutes must be a multiple of {STEP_MINUTES}")
    h = horizon_minutes // STEP_MINUTES
    d = clean_observations(df)
    g = d.groupby("road_id", sort=False)

    d["density"] = d["vehicle_count"] / ((d["length_m"] / 1000.0) * d["lanes"])
    d["occupancy"] = d["vehicle_count"] / d["capacity"]
    d["speed_ratio"] = d["average_speed"] / d["speed_limit_kmh"]
    # Lags fall back to the current value when history is too short (start of a series)
    d["occ_lag1"] = g["occupancy"].shift(1).fillna(d["occupancy"])
    d["occ_lag4"] = g["occupancy"].shift(4).fillna(d["occupancy"])
    d["speed_lag1"] = g["average_speed"].shift(1).fillna(d["average_speed"])
    d["occ_roll4"] = g["occupancy"].transform(lambda s: s.rolling(4, min_periods=1).mean())
    d["occ_trend"] = d["occupancy"] - d["occ_lag1"]
    d["road_type_code"] = d["road_type"].map(ROAD_TYPE_ORDER).fillna(1).astype(int)

    target_time = d["recorded_at"] + pd.Timedelta(minutes=horizon_minutes)
    frac_hour = target_time.dt.hour + target_time.dt.minute / 60.0
    d["target_hour_sin"] = np.sin(2 * np.pi * frac_hour / 24.0)
    d["target_hour_cos"] = np.cos(2 * np.pi * frac_hour / 24.0)
    d["target_dow"] = target_time.dt.dayofweek
    d["target_is_weekend"] = (d["target_dow"] >= 5).astype(int)
    d["target_time"] = target_time

    if with_target:
        d["target_density"] = g["density"].shift(-h)
        d["target_speed"] = g["average_speed"].shift(-h)
        # Only accept the shifted value if it really is `horizon` later (guards against missing rows)
        gap_ok = (g["recorded_at"].shift(-h) - d["recorded_at"]) == pd.Timedelta(minutes=horizon_minutes)
        d.loc[~gap_ok, TARGET_COLUMNS] = np.nan
    return d


def latest_feature_rows(history: pd.DataFrame, horizon_minutes: int = 30) -> pd.DataFrame:
    """Inference helper: features for the most recent observation of every road."""
    feats = add_features(history, horizon_minutes, with_target=False)
    return feats.sort_values("recorded_at").groupby("road_id", sort=False).tail(1).reset_index(drop=True)
