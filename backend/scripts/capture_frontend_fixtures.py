"""Record REAL API responses as frontend test fixtures (so tests use the true contract, not invented data).

    # with the API running on :8000 against a freshly seeded database:
    python scripts/capture_frontend_fixtures.py
Writes JSON files to frontend/src/test/fixtures/.  Needs SEED_DEFAULT_PASSWORD in the environment.
"""
import json
import os
import pathlib

import httpx

OUT = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "fixtures"
BASE = os.environ.get("API_URL", "http://localhost:8000")
PASSWORD = os.environ["SEED_DEFAULT_PASSWORD"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = httpx.Client(base_url=BASE, timeout=60)

    def auth(role: str) -> dict:
        r = c.post("/api/auth/login", json={"email": f"{role}@flowsense.demo", "password": PASSWORD})
        r.raise_for_status()
        return {"Authorization": "Bearer " + r.json()["access_token"]}

    op, vw = auth("operator"), auth("viewer")

    def save(name: str, response: httpx.Response) -> None:
        response.raise_for_status()
        (OUT / f"{name}.json").write_text(json.dumps(response.json(), indent=1))
        print(f"{name:20s} {len(response.content) // 1024:3d} KB")

    save("roads", c.get("/api/roads")); save("intersections", c.get("/api/intersections"))
    save("live", c.get("/api/traffic/live")); save("history", c.get("/api/traffic/history/5?hours=6"))
    save("overview", c.get("/api/analytics/overview")); save("trends", c.get("/api/analytics/traffic-trends?hours=6"))
    save("predictionOverview", c.get("/api/predictions/overview")); save("modelInfo", c.get("/api/predictions/model-info"))
    save("signals", c.get("/api/signals")); save("signalDetail", c.get("/api/signals/7"))
    save("optimize", c.post("/api/signals/optimize", json={"intersection_id": 7, "scenario": "shifting", "duration_s": 900, "seed": 42}, headers=vw))
    save("vehicles", c.get("/api/emergency-vehicles"))
    save("route", c.post("/api/routes/emergency", json={"vehicle_type": "ambulance", "origin_intersection_id": 1, "destination_intersection_id": 15}, headers=op))
    save("hotspots", c.get("/api/accidents/hotspots")); save("accidentAnalytics", c.get("/api/accidents/analytics"))
    save("accidents", c.get("/api/accidents?limit=20")); save("incidents", c.get("/api/incidents?active_only=true&limit=10"))
    save("user_operator", c.get("/api/auth/me", headers=op)); save("user_viewer", c.get("/api/auth/me", headers=vw))


if __name__ == "__main__":
    main()
