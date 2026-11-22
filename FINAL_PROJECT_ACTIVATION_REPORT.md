# FlowSense Project Activation Report

## Summary

The existing FlowSense project was activated locally in `C:\Users\ARYAN SANDEEP GURAV\OneDrive\Desktop\FlowSense_Final\FlowSense`.

| Area | Status |
|---|---|
| PostgreSQL | Passed |
| Alembic migrations | Passed |
| FastAPI | Passed |
| Swagger UI | Passed |
| React frontend | Passed |
| Frontend/backend integration | Passed |
| Backend tests | Passed |
| Frontend unit/component tests | Passed |
| Production build | Passed |
| Live API integration tests | Passed |
| Playwright desktop/tablet/mobile E2E | Passed |

## 1. Project Structure Inspected

Inspected the existing React + TypeScript frontend, FastAPI backend, SQLAlchemy models, Pydantic schemas, Alembic migrations, Docker Compose configuration, environment examples, tests, seed workflow, and ML pipeline. No project replacement or architecture redesign was performed.

## 2. PostgreSQL

- PostgreSQL 16 Compose service: healthy
- Container: `flowsense-db-1`
- Database: `flowsense`
- User: `flowsense`
- Container port: `5432`
- Host port: `5434`
- Existing volume: preserved

Ports `5432` and `5433` are occupied by other PostgreSQL services, so the existing FlowSense Compose service was mapped to host port `5434`. The existing `.env` was retargeted to `localhost:5434` for the native backend. No database or volume was recreated and no existing records were deleted.

## 3. Database and Migrations

- SQLAlchemy connection verified with `SELECT current_database(), current_user, inet_server_port()`.
- Alembic current revision: `0001 (head)`
- `alembic check`: no new upgrade operations detected
- Existing database already contained 28 roads and was not reseeded or reset.
- Transactional database behavior and constraints are covered by the passing backend suite.

## 4. FastAPI

- Backend started successfully at `http://127.0.0.1:8000`
- Swagger UI returned HTTP 200 at `http://127.0.0.1:8000/docs`
- Health endpoint returned database OK and model available
- CORS includes the configured local frontend origins.

## 5. Frontend

- Vite development server: `http://127.0.0.1:5173`
- Production preview: `http://127.0.0.1:4173`
- Production bundle rebuilt with `VITE_API_URL=http://127.0.0.1:8000`
- Frontend unit/component suite: 166/166 passed
- Production build: passed

The default frontend test worker count was reduced to one to remove resource-load flakiness in the existing component suite. Two lazy-route assertions received a longer lookup timeout.

## 6. ML Model

The existing dataset-generation and training pipeline was run because no trained model was initially available.

- 75,264 simulated training rows
- 28 roads
- Random Forest model saved at `backend/app/ml/artifacts/congestion_model.joblib`
- Health endpoint subsequently reported `model_available: true`

## 7. Test Results

### Backend

- 131 tests passed
- 0 failed
- 1 dependency deprecation warning

### Frontend

- 19 test files passed
- 166 tests passed
- 0 failed

### Live API integration

- 7/7 tests passed against the real FastAPI and PostgreSQL-backed backend

### Playwright E2E

- 3/3 projects passed serially:
  - Desktop
  - Tablet
  - Mobile

The Playwright run verified landing, login, dashboard, navigation, reload, and logout. Map tiles from third-party OpenStreetMap were not visually audited.

## 8. Bugs Discovered and Fixed

- FlowSense Compose host port changed from occupied port `5432` to `5434`.
- Native backend `.env` database port changed to match the Compose service.
- Frontend test concurrency was limited to one worker to avoid timing flakiness.
- Lazy front-door route assertions received a five-second lookup timeout.
- The ML model was generated and trained.

## 9. Remaining Issues and Limitations

- Port `5434` is an environment-specific workaround because `5432` and `5433` are occupied.
- Playwright should be run with `--workers=1` in resource-constrained environments.
- React tests emit non-failing `act(...)` warnings in some signal/landing tests.
- External OpenStreetMap tiles were not visually validated.
- Backend and frontend are currently running in the assistant session and should be stopped by the user if they are not needed.

## 10. Local Startup Commands

From the project root:

```powershell
.\start-local.ps1
```

Manual startup:

```powershell
cd C:\Users\ARYAN SANDEEP GURAV\OneDrive\Desktop\FlowSense_Final\FlowSense
docker compose up -d db

cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second PowerShell window:

```powershell
cd C:\Users\ARYAN SANDEEP GURAV\OneDrive\Desktop\FlowSense_Final\FlowSense\frontend
npm run dev
```

Addresses:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
