# Dependency Audit

## Backend

- Installed environment: Python virtual environment with pinned `requirements.txt`.
- `pip check`: PASS; no broken requirements.
- `pip-audit`: NOT TESTED; module not installed.
- License metadata was inspected with installed package metadata. Several dependencies report BSD, MIT, MPL-2.0, PSF/BSD-derived, or unknown fields. Unknown fields require official source verification.

## Frontend

- Exact dependencies are pinned in `package.json` and `package-lock.json`.
- `npm audit --omit=dev --audit-level=high`: 2 moderate vulnerabilities in React Router.
- Advisory: React Router versions 6.0.0 through 7.17.0 in the installed dependency graph.
- Recommended fix reported by npm is React Router DOM 7.18.6, a breaking major upgrade.
- No breaking force-update was applied because it requires route API compatibility and regression testing.

## Release gate

Public release remains BLOCKED only for unresolved dependency security advisories and formal license verification. The application can run locally.
