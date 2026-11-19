"""Shared FastAPI dependencies: authentication and role checks."""
from __future__ import annotations

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AuthError, ForbiddenError
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)
ROLE_RANK = {"viewer": 0, "operator": 1, "admin": 2}


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise AuthError("Authentication required")
    try:
        user_id = decode_access_token(creds.credentials)
    except (jwt.PyJWTError, ValueError, KeyError):
        raise AuthError("Invalid or expired token") from None
    user = db.get(User, user_id)  # role is always re-read from the DB, never trusted from the token
    if user is None or not user.is_active:
        raise AuthError("Account not found or disabled")
    return user


def require_role(minimum: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[minimum]:
            raise ForbiddenError(f"This action requires the '{minimum}' role")
        return user
    return checker


require_operator = require_role("operator")
require_admin = require_role("admin")


def get_model_store(request: Request):
    return request.app.state.model_store


def get_simulation(request: Request):
    return request.app.state.simulation
