from datetime import datetime, timedelta, timezone

import numpy as np

from app.algorithms.hotspots import AccidentPoint, find_hotspots


def _points(centre, n, spread_m, start_id, severity="medium"):
    rng = np.random.default_rng(start_id)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [AccidentPoint(start_id + i, centre[0] + rng.normal(0, spread_m) / 111_320, centre[1] + rng.normal(0, spread_m) / 105_000,
                          severity, "rear_end", base + timedelta(days=i)) for i in range(n)]


def test_two_clusters_found_and_isolated_points_ignored():
    pts = _points((18.52, 73.85), 30, 20, 0) + _points((18.54, 73.88), 20, 20, 1000, "high")
    pts += [AccidentPoint(5000, 18.60, 73.95, "low", "x", datetime(2026, 2, 1, tzinfo=timezone.utc))]  # lone accident
    result = find_hotspots(pts, eps_m=150, min_samples=6)
    assert len(result) == 2
    assert {h["accident_count"] for h in result} == {30, 20}
    assert result[0]["rank"] == 1 and result[0]["severity_score"] >= result[1]["severity_score"]
    assert all(5000 not in h["accident_ids"] for h in result)


def test_too_few_points_gives_no_hotspots():
    assert find_hotspots(_points((18.5, 73.8), 3, 10, 0), min_samples=6) == []
    assert find_hotspots([], min_samples=6) == []


def test_uniform_scatter_has_no_hotspot():
    rng = np.random.default_rng(0)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    pts = [AccidentPoint(i, 18.4 + rng.random() * 0.2, 73.7 + rng.random() * 0.2, "low", "x", base) for i in range(40)]
    assert find_hotspots(pts, eps_m=150, min_samples=6) == []
