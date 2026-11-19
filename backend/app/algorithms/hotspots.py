"""Accident hotspot detection with DBSCAN.

IMPORTANT: a hotspot is a place where accidents have been *concentrated in the past*.
It is descriptive. It is not a prediction that an accident will happen there.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from sklearn.cluster import DBSCAN

from app.algorithms.geo import EARTH_RADIUS_M, haversine_m

SEVERITY_WEIGHT = {"low": 1, "medium": 2, "high": 4, "critical": 8}


@dataclass(frozen=True)
class AccidentPoint:
    id: int
    lat: float
    lon: float
    severity: str
    accident_type: str
    occurred_at: datetime


def find_hotspots(points: list[AccidentPoint], eps_m: float = 150.0, min_samples: int = 6) -> list[dict]:
    """Cluster accident coordinates.

    Input : accident points, neighbourhood radius `eps_m` (metres), `min_samples`.
    Output: clusters ranked by severity-weighted score (highest first). Isolated accidents ("noise") are excluded.
    Method: DBSCAN with the haversine metric on radians, so eps is a real distance on the sphere.
    Time  : O(n log n) average with the ball-tree index.
    """
    if len(points) < max(min_samples, 1):
        return []
    coords = np.radians(np.array([[p.lat, p.lon] for p in points]))
    labels = DBSCAN(eps=eps_m / EARTH_RADIUS_M, min_samples=min_samples, metric="haversine",
                    algorithm="ball_tree").fit_predict(coords)

    clusters: list[dict] = []
    for label in sorted(set(labels) - {-1}):
        members = [p for p, l in zip(points, labels) if l == label]
        clat = float(np.mean([m.lat for m in members]))
        clon = float(np.mean([m.lon for m in members]))
        radius = max(haversine_m(clat, clon, m.lat, m.lon) for m in members)
        severities = Counter(m.severity for m in members)
        span_days = max(1.0, (max(m.occurred_at for m in members) - min(m.occurred_at for m in members)).days)
        clusters.append({
            "center_lat": round(clat, 6),
            "center_lon": round(clon, 6),
            "radius_m": round(radius, 1),
            "accident_count": len(members),
            "severity_counts": {s: severities.get(s, 0) for s in SEVERITY_WEIGHT},
            "severity_score": sum(SEVERITY_WEIGHT[m.severity] for m in members),
            "top_accident_type": Counter(m.accident_type for m in members).most_common(1)[0][0],
            "accidents_per_month": round(len(members) / span_days * 30.0, 2),
            "first_occurrence": min(m.occurred_at for m in members).isoformat(),
            "last_occurrence": max(m.occurred_at for m in members).isoformat(),
            "accident_ids": [m.id for m in members],
        })
    clusters.sort(key=lambda c: (c["severity_score"], c["accident_count"]), reverse=True)
    for rank, c in enumerate(clusters, start=1):
        c["rank"] = rank
    return clusters
