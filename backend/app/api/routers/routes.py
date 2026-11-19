from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_operator
from app.database.session import get_db
from app.models import User
from app.schemas.routing import EmergencyVehicleOut, RecalcOut, RouteOut, RouteRequest
from app.services import routing_service

router = APIRouter(tags=["emergency"])


@router.get("/emergency-vehicles", response_model=list[EmergencyVehicleOut])
def vehicles(db: Session = Depends(get_db)):
    return routing_service.list_vehicles(db)


@router.post("/routes/emergency", response_model=RouteOut, status_code=201)
def plan(body: RouteRequest, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    return routing_service.create_route(db, user, body.vehicle_id, body.vehicle_type, body.origin_intersection_id,
                                        body.destination_intersection_id, body.algorithm, body.objective,
                                        body.include_alternative)


@router.get("/routes", response_model=list[RouteOut])
def recent(limit: int = 20, db: Session = Depends(get_db)):
    return routing_service.list_routes(db, min(max(limit, 1), 100))


@router.get("/routes/{route_id}", response_model=RouteOut)
def get_route(route_id: int, db: Session = Depends(get_db)):
    return routing_service.route_out(routing_service.get_route(db, route_id))


@router.post("/routes/{route_id}/recalculate", response_model=RecalcOut, dependencies=[Depends(require_operator)])
def recalc(route_id: int, db: Session = Depends(get_db)):
    return routing_service.recalculate(db, routing_service.get_route(db, route_id))
