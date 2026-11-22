# Contributing to FlowSense

## Setup

1. Create a local backend environment from `backend/requirements-dev.txt`.
2. Copy `.env.example` to `.env` and configure a local PostgreSQL database.
3. Use the documented Alembic migration and seed commands.
4. Install frontend dependencies with `npm ci`.

Do not commit `.env`, credentials, database files, generated artifacts, or local data.

## Development checks

```powershell
cd FlowSense\backend
python -m pytest
python -m pip check

cd ..\frontend
npm test
npm run typecheck
npm run build
npm audit
```

## Pull requests

- Preserve the existing API contract unless the change documents a deliberate versioned migration.
- Add focused tests for behavior changes.
- Do not weaken assertions or skip failures.
- Re-run migration checks for database changes.
- Keep demo passwords and secrets environment-provided.
