from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, require_operator, require_role
from app.core.exceptions import ForbiddenError
from app.database.session import get_db
from app.models import User
from app.schemas.signals import OptimizeOut, OptimizeRequest, SignalDetailOut, SignalOut
from app.services import signal_service

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[SignalOut])
def list_signals(db: Session = Depends(get_db)):
    return signal_service.list_signals(db)


@router.post("/optimize", response_model=OptimizeOut)
def optimize(body: OptimizeRequest, db: Session = Depends(get_db), user: User = Depends(require_role("viewer"))):
    if body.apply and ROLE_RANK[user.role] < ROLE_RANK["operator"]:
        raise ForbiddenError("Applying timing to a live signal requires the 'operator' role")
    return signal_service.optimize(db, body.intersection_id, body.scenario, body.duration_s, body.seed, body.apply, user)


@router.get("/{intersection_id}", response_model=SignalDetailOut)
def detail(intersection_id: int, db: Session = Depends(get_db)):
    return signal_service.signal_detail(db, intersection_id)


@router.post("/{intersection_id}/reset", response_model=SignalDetailOut, dependencies=[Depends(require_operator)])
def reset(intersection_id: int, db: Session = Depends(get_db)):
    """Return a signal to fixed-time operation."""
    signal_service.reset_to_fixed(db, intersection_id)
    return signal_service.signal_detail(db, intersection_id)
