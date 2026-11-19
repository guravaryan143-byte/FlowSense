from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_operator, require_role
from app.database.session import get_db
from app.models import User
from app.schemas.common import Page, Severity
from app.schemas.incidents import CloseRoadOut, IncidentCreate, IncidentOut, IncidentStatus, IncidentUpdate
from app.services import incident_service

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("", response_model=IncidentOut, status_code=201)
def create(body: IncidentCreate, db: Session = Depends(get_db), user: User = Depends(require_role("viewer"))):
    """Any signed-in user can report an incident."""
    return incident_service.to_dict(db, incident_service.create(db, user, body))


@router.get("", response_model=Page[IncidentOut])
def list_incidents(status: IncidentStatus | None = None, severity: Severity | None = None, road_id: int | None = None,
                   active_only: bool = False, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                   db: Session = Depends(get_db)):
    return incident_service.list_incidents(db, status, severity, road_id, active_only, limit, offset)


@router.get("/{incident_id}", response_model=IncidentOut)
def get(incident_id: int, db: Session = Depends(get_db)):
    return incident_service.to_dict(db, incident_service.get(db, incident_id))


@router.patch("/{incident_id}", response_model=IncidentOut, dependencies=[Depends(require_operator)])
def update(incident_id: int, body: IncidentUpdate, db: Session = Depends(get_db)):
    inc = incident_service.update(db, incident_id, body.status, body.severity, body.description)
    return incident_service.to_dict(db, inc)


@router.post("/{incident_id}/close-road", response_model=CloseRoadOut, dependencies=[Depends(require_operator)])
def close_road(incident_id: int, db: Session = Depends(get_db)):
    """Close the incident's road, then re-plan every emergency route that used it."""
    return incident_service.close_road(db, incident_id)
