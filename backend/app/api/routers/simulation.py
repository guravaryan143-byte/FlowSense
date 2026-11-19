from fastapi import APIRouter, Depends

from app.api.deps import get_simulation, require_operator
from app.schemas.simulation import SimulationStartIn, SimulationStatusOut

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.post("/start", response_model=SimulationStatusOut, dependencies=[Depends(require_operator)])
async def start(body: SimulationStartIn, sim=Depends(get_simulation)):
    return await sim.start(body.tick_interval_s, body.minutes_per_tick, body.signal_mode, body.demand_multiplier, body.seed)


@router.post("/stop", response_model=SimulationStatusOut, dependencies=[Depends(require_operator)])
async def stop(sim=Depends(get_simulation)):
    return await sim.stop()


@router.get("/status", response_model=SimulationStatusOut)
def status(sim=Depends(get_simulation)):
    return sim.status()
