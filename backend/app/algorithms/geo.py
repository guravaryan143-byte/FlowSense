"""Small geographic helpers (no external dependencies)."""
import math

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres. O(1)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial compass bearing from point 1 to point 2, 0..360 (0 = north)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlmb = math.radians(lon2 - lon1)
    y = math.sin(dlmb) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlmb)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def polyline_length_m(points: list[list[float]] | list[tuple[float, float]]) -> float:
    return sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(points, points[1:]))


def point_on_polyline(points: list[list[float]], fraction: float) -> tuple[float, float]:
    """Point at `fraction` (0..1) of the polyline's length. Used to place incidents/accidents on roads."""
    fraction = min(1.0, max(0.0, fraction))
    total = polyline_length_m(points)
    target = total * fraction
    walked = 0.0
    for a, b in zip(points, points[1:]):
        seg = haversine_m(a[0], a[1], b[0], b[1])
        if walked + seg >= target and seg > 0:
            t = (target - walked) / seg
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        walked += seg
    return points[-1][0], points[-1][1]
