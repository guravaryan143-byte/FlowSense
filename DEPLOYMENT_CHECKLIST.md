# Deployment Checklist

## PASS

- Docker Compose database service starts and passes `pg_isready`.
- Docker database volume is preserved across restart.
- Backend container image builds.
- Containerized backend connects to PostgreSQL.
- Health endpoint succeeds.
- Alembic applies/checks `0001`.
- Frontend strict typecheck passes.
- Frontend production build passes.
- Frontend production preview responds HTTP 200.

## BLOCKED / NOT TESTED

- Production hosting deployment: NOT TESTED and was not authorized.
- External database credentials and backup procedure: NOT TESTED.
- Demo password reseeding in production: NOT TESTED.
- External CORS origin: NOT TESTED.
- TLS, DNS, secret storage, and managed database: NOT TESTED.
- React Router security upgrade: BLOCKED pending breaking-version migration.
- Backend `pip-audit`: NOT TESTED; tool unavailable.

## Safe release procedure

1. Set a unique production `SECRET_KEY` of at least 32 characters.
2. Set a production database URL and rotate the database password.
3. Set production CORS origins.
4. Run `alembic upgrade head` against a backed-up database.
5. Run migrations and health checks before frontend traffic.
6. Seed or migrate accounts only through the approved operational process.
7. Build and deploy the frontend with the correct `VITE_API_URL`.
8. Verify REST, WebSocket, authentication, and database persistence.
