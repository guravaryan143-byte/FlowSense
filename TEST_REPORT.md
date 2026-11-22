# Test Report

## Backend

Command: `cd backend && .\.venv\Scripts\python.exe -m pytest -q`

Result: PASS - 129 tests passed, 1 deprecation warning, 70.96 seconds.

## Frontend

Command: `cd frontend && npm test`

Result: PASS - 19 test files passed, 166 tests passed.

A focused routing rerun also passed all 9 tests after extending the lazy-landing timeout from the default 1 second to 3 seconds.

## Frontend build and typecheck

- `npm run typecheck`: PASS.
- `npm run build`: PASS; strict TypeScript and Vite production bundle completed.
- Production preview: PASS; `npm run preview -- --host 127.0.0.1 --port 4173` returned HTTP 200.

## PostgreSQL and API

- Docker `db` health: PASS.
- Containerized backend health: PASS - `GET /api/health` returned `status=ok`, `database=ok`.
- Roads endpoint: PASS - response contained road data.
- Alembic current/check: PASS.
- PostgreSQL CRUD rollback: PASS.

## Not executed

- Browser automation against the production preview was NOT TESTED in this execution.
- Desktop/mobile visual review was NOT TESTED.
- Full external deployment was NOT TESTED.
