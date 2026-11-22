# Integration Test Report

## Live frontend-backend suite

PASS: 7/7 tests.

Verified:

- Anonymous health, roads, intersections, live traffic, trends, and overview.
- Viewer/operator authentication and role enforcement.
- Prediction model availability and saved prediction runs.
- Signal listing, detail, and measured optimization.
- Emergency routing and incident road closure/reopening.
- Accident analytics and hotspots.
- Simulation start/stop and WebSocket updates.

## ML model

PASS:

- Generated 75,264 simulated training rows in the Docker data volume.
- Trained and persisted `congestion_model.joblib` in the Docker artifact volume.
- Health endpoint reported `model_available=true`.

No database reset or PostgreSQL volume recreation occurred.
