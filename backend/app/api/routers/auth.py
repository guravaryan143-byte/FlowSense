from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.exceptions import AuthError, TooManyRequests
from app.core.security import create_access_token
from app.database.session import get_db
from app.models import User
from app.schemas.auth import LoginIn, RegisterIn, RoleUpdate, TokenOut, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Public sign-up. New accounts are always 'viewer'; only an admin can promote them."""
    return auth_service.register_user(db, body.name, body.email, body.password, role="viewer")


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    limiter = request.app.state.login_limiter
    key = f"{request.client.host if request.client else 'unknown'}:{body.email.lower()}"
    if limiter.blocked(key):
        raise TooManyRequests("Too many failed logins. Try again in a few minutes.")
    user = auth_service.authenticate(db, body.email, body.password)
    if user is None:
        limiter.record_failure(key)
        raise AuthError("Invalid email or password")
    limiter.reset(key)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(require_admin)])
def users(db: Session = Depends(get_db)):
    return auth_service.list_users(db)


@router.patch("/users/{user_id}/role", response_model=UserOut, dependencies=[Depends(require_admin)])
def change_role(user_id: int, body: RoleUpdate, db: Session = Depends(get_db)):
    return auth_service.set_role(db, user_id, body.role)
