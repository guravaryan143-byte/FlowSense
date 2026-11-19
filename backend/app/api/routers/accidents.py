from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.accidents import AccidentAnalyticsOut, AccidentOut, HotspotsOut
from app.schemas.common import Page, Severity
from app.services import accident_service

router = APIRouter(prefix="/accidents", tags=["accidents"])


def _utc(dt: datetime | None) -> datetime | None:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class Filters:
    def __init__(self, date_from: datetime | None = None, date_to: datetime | None = None, severity: Severity | None = None):
        self.date_from, self.date_to, self.severity = _utc(date_from), _utc(date_to), severity


F = Annotated[Filters, Depends()]


@router.get("", response_model=Page[AccidentOut])
def list_accidents(f: F, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return accident_service.list_accidents(db, f.date_from, f.date_to, f.severity, limit, offset)


@router.get("/hotspots", response_model=HotspotsOut)
def hotspots(f: F, eps_m: float = Query(150, ge=30, le=1000), min_samples: int = Query(8, ge=3, le=100),
             db: Session = Depends(get_db)):
    return accident_service.hotspots(db, f.date_from, f.date_to, f.severity, eps_m, min_samples)


@router.get("/analytics", response_model=AccidentAnalyticsOut)
def analytics(f: F, db: Session = Depends(get_db)):
    return accident_service.analytics(db, f.date_from, f.date_to, f.severity)
