"""ML pipeline: cleaning, features, leakage-safe split, training, metrics, missing model."""
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from app.core.exceptions import ModelNotTrainedError
from app.ml.features import FEATURE_COLUMNS, TARGET_COLUMNS, add_features, clean_observations, latest_feature_rows
from app.ml.model_store import ModelStore
from app.ml.train import (baseline_historical_mean, baseline_persistence, chronological_split, road_metadata, save_artifact,
                          train_model)
from app.simulation.generate_data import generate_history, inject_sensor_dropouts

END = datetime(2026, 11, 2, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def raw():
    df = generate_history(days=6, end_time=END, seed=3)
    return inject_sensor_dropouts(df, 0.03, 1).merge(road_metadata(), on="road_id")


@pytest.fixture(scope="module")
def artifact(raw):
    return train_model(raw, horizon_minutes=30, n_estimators=12)


def test_cleaning_removes_all_missing_values(raw):
    assert raw[["vehicle_count", "average_speed"]].isna().any().any()  # the fixture really has holes
    cleaned = clean_observations(raw)
    assert not cleaned[["vehicle_count", "average_speed"]].isna().any().any()
    assert len(cleaned) == len(raw)


def test_cleaning_uses_only_the_past():
    """Changing a FUTURE reading must not change an earlier filled value (no leakage from the future)."""
    base = pd.DataFrame({"road_id": 1, "recorded_at": pd.date_range("2026-01-01", periods=12, freq="15min", tz="UTC"),
                         "vehicle_count": [10, 12, np.nan, np.nan, np.nan, 14, 15, 16, 17, 18, 19, 20.0],
                         "average_speed": 40.0, "capacity": 200, "speed_limit_kmh": 50.0})
    other = base.copy()
    other.loc[11, "vehicle_count"] = 5000.0  # wildly different future
    a, b = clean_observations(base), clean_observations(other)
    assert a.loc[:9, "vehicle_count"].tolist() == b.loc[:9, "vehicle_count"].tolist()


def test_negative_readings_treated_as_missing():
    df = pd.DataFrame({"road_id": [1, 1, 1], "recorded_at": pd.date_range("2026-01-01", periods=3, freq="15min", tz="UTC"),
                       "vehicle_count": [10, -5, 12], "average_speed": [40.0, 41.0, 42.0], "capacity": 100, "speed_limit_kmh": 50.0})
    assert (clean_observations(df)["vehicle_count"] >= 0).all()


def test_features_complete_and_targets_aligned(raw):
    f = add_features(raw, 30)
    assert set(FEATURE_COLUMNS) <= set(f.columns)
    ok = f.dropna(subset=TARGET_COLUMNS)
    assert not ok[FEATURE_COLUMNS].isna().any().any()
    # target of a row is the density exactly 30 minutes later on the same road
    row = ok.iloc[10]
    later = f[(f.road_id == row.road_id) & (f.recorded_at == row.recorded_at + pd.Timedelta(minutes=30))].iloc[0]
    assert row.target_density == pytest.approx(later.density)


def test_horizon_must_be_multiple_of_step(raw):
    with pytest.raises(ValueError):
        add_features(raw, 20)


def test_chronological_split_has_no_overlap_or_leakage(raw):
    feats = add_features(raw, 30)
    train, test, split = chronological_split(feats, 30)
    assert train["target_time"].max() <= split          # training targets never reach into the test period
    assert test["recorded_at"].min() >= split
    assert train["recorded_at"].max() < test["recorded_at"].min()
    assert len(train) > len(test) > 0


def test_training_produces_all_metrics_and_beats_nothing_fake(artifact):
    info = artifact["info"]
    for model_name in ("random_forest", "baseline_persistence", "baseline_historical_mean"):
        for target in TARGET_COLUMNS:
            m = info["metrics"][model_name][target]
            assert set(m) == {"mae", "rmse", "r2"}
            assert m["mae"] >= 0 and m["rmse"] >= m["mae"] - 1e-9
    assert info["data_source"] == "simulated"
    assert info["n_train"] > 0 and info["n_test"] > 0
    assert sum(info["feature_importances"].values()) == pytest.approx(1.0, abs=0.01)


def test_random_forest_is_better_than_the_naive_baselines_on_density(artifact):
    m = artifact["info"]["metrics"]
    assert m["random_forest"]["target_density"]["mae"] < m["baseline_persistence"]["target_density"]["mae"]
    assert m["random_forest"]["target_density"]["mae"] < m["baseline_historical_mean"]["target_density"]["mae"]


def test_baselines_have_correct_shape(raw):
    feats = add_features(raw, 30)
    train, test, _ = chronological_split(feats, 30)
    assert baseline_persistence(test).shape == (len(test), 2)
    assert baseline_historical_mean(train, test).shape == (len(test), 2)


def test_metrics_match_sklearn_by_hand():
    from app.ml.train import _metrics
    yt = pd.DataFrame({"target_density": [1.0, 2.0, 3.0], "target_speed": [10.0, 20.0, 30.0]})
    yp = np.array([[1.0, 12.0], [3.0, 20.0], [3.0, 28.0]])
    m = _metrics(yt, yp)
    assert m["target_density"]["mae"] == pytest.approx(1 / 3, abs=1e-3)
    assert m["target_density"]["rmse"] == pytest.approx(np.sqrt(1 / 3), abs=1e-3)
    assert m["target_speed"]["mae"] == pytest.approx(4 / 3, abs=1e-3)


def test_prediction_output_for_latest_rows(artifact, raw):
    hist = raw[raw.recorded_at >= raw.recorded_at.max() - pd.Timedelta(hours=2)]
    rows = latest_feature_rows(hist, 30)
    assert len(rows) == hist.road_id.nunique()
    pred = artifact["model"].predict(rows[FEATURE_COLUMNS])
    assert pred.shape == (len(rows), 2) and np.isfinite(pred).all() and (pred[:, 0] >= 0).all()


def test_model_store_missing_then_present(tmp_path, artifact):
    store = ModelStore(tmp_path / "models")
    assert store.is_available() is False and store.info() is None
    with pytest.raises(ModelNotTrainedError):
        store.get()
    save_artifact(artifact, tmp_path / "models")
    assert store.is_available() is True and store.info()["version"] == artifact["info"]["version"]


def test_corrupt_model_file_does_not_crash(tmp_path):
    d = tmp_path / "m"
    d.mkdir()
    (d / "congestion_model.joblib").write_bytes(b"not a model")
    assert ModelStore(d).is_available() is False


def test_too_little_data_is_rejected():
    tiny = generate_history(days=1, end_time=END, seed=1, warmup_days=0).head(40).merge(road_metadata(), on="road_id")
    with pytest.raises(ValueError):
        train_model(tiny, 30, n_estimators=3)
