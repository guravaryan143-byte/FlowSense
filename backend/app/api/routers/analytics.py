from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_model_store, get_simulation
from app.database.session import get_db
from app.schemas.analytics import AnalyticsOverview, TrendsOut
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
def overview(db: Session = Depends(get_db), store=Depends(get_model_store), sim=Depends(get_simulation)):
    return analytics_service.overview(db, store, sim.status())


@router.get("/traffic-trends", response_model=TrendsOut)
def trends(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)):
    return analytics_service.traffic_trends(db, hours)
