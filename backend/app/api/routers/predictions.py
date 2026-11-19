from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_model_store, require_role
from app.database.session import get_db
from app.models import User
from app.schemas.predictions import (ModelInfoOut, PredictionOut, PredictionOverviewOut, PredictionRequest,
                                     RoadPredictionOut)
from app.services import prediction_service

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/overview", response_model=PredictionOverviewOut)
def overview(db: Session = Depends(get_db), store=Depends(get_model_store)):
    return prediction_service.overview(db, store)


@router.get("/model-info", response_model=ModelInfoOut)
def model_info(store=Depends(get_model_store)):
    return prediction_service.model_info(store)


@router.get("/{road_id}", response_model=RoadPredictionOut)
def road(road_id: int, db: Session = Depends(get_db), store=Depends(get_model_store)):
    return prediction_service.road_prediction(db, store, road_id)


@router.post("", response_model=list[PredictionOut])
def create(body: PredictionRequest, db: Session = Depends(get_db), store=Depends(get_model_store),
           _user: User = Depends(require_role("viewer"))):
    return prediction_service.predict(db, store, body.road_ids, persist=body.persist)
