# Database Validation

Validated with PostgreSQL 16.15 from the Docker Compose `db` service.

## Results

- PostgreSQL container: PASS; healthy and listening on port 5432.
- SQLAlchemy: PASS through the running containerized backend.
- Alembic revision: PASS; current revision `0001`, head `0001`.
- Migration drift: PASS; `alembic check` reported no new upgrade operations.
- Schema: PASS; 12 application/migration tables exist.
- Seed records: PASS; 43,036 traffic records existed when checked.
- CRUD transaction: PASS; insert, update, delete, and `ROLLBACK` were executed in one transaction.
- Persistence: PASS; existing records and revision remained after container restart.

## CRUD evidence

The probe inserted a viewer with `created_at=now()`, updated its name, deleted it, confirmed zero rows, then rolled back. The database returned:

- INSERT 0 1
- UPDATE 1
- DELETE 1
- Final probe count 0

The same PostgreSQL volume and database were retained. No volume deletion, table truncation, migration reset, or schema recreation was performed.

## Constraint and configuration findings

- Native PostgreSQL is also listening on port 5432 on the host.
- The Docker database role password initially differed from the host `.env` configuration. The existing role password was synchronized to the configured value; no records or tables were recreated.
- One demo login check received HTTP 401 because its current seeded password did not match the configured local demo password. Existing demo account rows are present for `admin`, `operator`, and `viewer`.
