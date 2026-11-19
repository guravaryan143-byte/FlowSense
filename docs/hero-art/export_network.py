"""Read-only export of the SIMULATED network + its busiest recorded moment, for rendering the hero art."""
import json, os, pathlib
from sqlalchemy import create_engine, text
e = create_engine(os.environ["DATABASE_URL"])
with e.connect() as c:
    nodes = [dict(r._mapping) for r in c.execute(text("select id, name, latitude, longitude from intersections order by id"))]
    roads = [dict(r._mapping) for r in c.execute(text("select id, road_name, start_node_id, end_node_id, lanes, road_type, geometry, length_m from roads order by id"))]
    peak = c.execute(text("""select recorded_at, avg(density) d, count(*) n from traffic_records
                             group by recorded_at having count(*)=28 order by d desc limit 1""")).first()
    rows = [dict(r._mapping) for r in c.execute(text(
        "select road_id, density, vehicle_count, average_speed, congestion_level from traffic_records where recorded_at=:t order by road_id"), {"t": peak.recorded_at})]
out = {"peak_time": peak.recorded_at.isoformat(), "peak_mean_density": float(peak.d), "nodes": nodes, "roads": roads, "traffic": rows}
json.dump(out, open(pathlib.Path(__file__).resolve().parent / "network.json", "w"), default=str)
from collections import Counter
print("peak:", out["peak_time"], "| roads:", len(roads), "nodes:", len(nodes))
print("levels at peak:", dict(Counter(r["congestion_level"] for r in rows)))
print("geometry sample:", roads[0]["geometry"][:3], "type:", type(roads[0]["geometry"]).__name__)
print("lat range:", min(n["latitude"] for n in nodes), max(n["latitude"] for n in nodes), "lon range:", min(n["longitude"] for n in nodes), max(n["longitude"] for n in nodes))
