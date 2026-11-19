from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password, verify_password
from app.models import User


def register_user(db: Session, name: str, email: str, password: str, role: str = "viewer") -> User:
    email = email.lower().strip()
    if db.scalar(select(func.count()).select_from(User).where(User.email == email)):
        raise ConflictError("An account with this email already exists")
    user = User(name=name, email=email, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalars(select(User).where(User.email == email.lower().strip())).first()
    ok = verify_password(password, user.password_hash if user else None)
    return user if (user and ok and user.is_active) else None


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)))


def set_role(db: Session, user_id: int, role: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    user.role = role
    db.commit()
    return user
