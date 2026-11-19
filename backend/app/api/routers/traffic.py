from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Intersection, Road
from app.schemas.common import Page
from app.schemas.traffic import HistoryPoint, IntersectionOut, LiveTrafficOut, RoadOut, RoadTrafficOut
from app.services import traffic_service

router = APIRouter(tags=["traffic"])


@router.get("/roads", response_model=list[RoadOut])
def roads(db: Session = Depends(get_db)):
    return list(db.scalars(select(Road).order_by(Road.id)))


@router.get("/intersections", response_model=list[IntersectionOut])
def intersections(db: Session = Depends(get_db)):
    return list(db.scalars(select(Intersection).order_by(Intersection.id)))


@router.get("/traffic/live", response_model=LiveTrafficOut)
def live(db: Session = Depends(get_db)):
    return traffic_service.live_snapshot(db)


@router.get("/traffic/history/{road_id}", response_model=Page[HistoryPoint])
def history(road_id: int, hours: int = Query(24, ge=1, le=168), limit: int = Query(500, ge=1, le=2000),
            offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return traffic_service.road_history(db, road_id, hours, limit, offset)


@router.get("/traffic/{road_id}", response_model=RoadTrafficOut)
def road(road_id: int, db: Session = Depends(get_db)):
    return traffic_service.road_traffic(db, road_id)
