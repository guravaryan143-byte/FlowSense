# Security Audit

## Findings

| Severity | Finding | Status |
|---|---|---|
| Moderate | React Router versions 6.0.0 through 7.17.0 have advisory coverage for open redirect/bypass and SSR hydration constructor issues. | OPEN - breaking upgrade required |
| Low | Demo account passwords must be reseeded whenever existing password hashes do not match the current environment. | DOCUMENTED |
| Low | Docker host port 5432 may conflict with native PostgreSQL. | DOCUMENTED |

## Verified controls

- JWT authentication and role-based authorization are present and covered by backend tests.
- Password hashing uses Argon2.
- Request validation errors do not echo submitted passwords.
- CORS is configured through environment settings.
- HTTP security headers include `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Database sessions roll back on exceptions and close in `finally`.
- Secrets were not added to source or reports.
- `.env` is not treated as source-controlled configuration.

## Dependency audit

`npm audit --omit=dev --audit-level=high` found 2 moderate React Router advisories. `npm audit fix --force` proposes React Router DOM 7.18.6, a breaking change that was not applied because migration and regression testing are required.

Backend `pip-audit` was NOT TESTED because the tool is not installed. The backend virtual environment had no broken packages according to `pip check`.
