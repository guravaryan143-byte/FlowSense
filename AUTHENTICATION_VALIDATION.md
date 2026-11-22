# Authentication Validation

## Live PostgreSQL/container verification

PASS:

- Operator login with the configured demo credential.
- Operator `/auth/me` protected endpoint.
- Wrong-password login: 401.
- Garbage-token `/auth/me`: 401.
- Demo account rows use 97-character Argon2 hashes and remain active.
- Real accounts are not deleted or password-updated by seeding.

## Automated verification

PASS:

- Registration creates a viewer.
- Duplicate email conflicts.
- Validation does not echo passwords.
- Wrong and unknown users return the same login shape.
- Login rate limiting.
- Missing and garbage tokens.
- Expired tokens.
- Admin-only role operations.
- Password hashing uses Argon2.
- New database tests cover idempotent account creation and explicit password synchronization.

## Production guard

The seed module rejects `--reset`, `--ensure-demo-accounts`, and `--sync-demo-passwords` when `ENVIRONMENT=production`.
