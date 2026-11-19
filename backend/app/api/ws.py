from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder

from app.services import traffic_service

router = APIRouter()


def _snapshot(app) -> dict:
    with app.state.session_factory() as db:
        snap = traffic_service.live_snapshot(db)
    return jsonable_encoder({"type": "snapshot", **snap})  # datetimes -> ISO strings (send_json uses plain json)


@router.websocket("/ws/traffic")
async def traffic_socket(ws: WebSocket):
    """Read-only stream of simulation ticks. Sends a snapshot on connect, then 'traffic_update' messages."""
    app = ws.app
    origin = ws.headers.get("origin")
    if origin and origin not in app.state.allowed_origins:  # block cross-site pages from attaching
        await ws.close(code=1008)
        return
    hub = app.state.hub
    await hub.connect(ws)
    try:
        await ws.send_json(await run_in_threadpool(_snapshot, app))
        await ws.send_json({"type": "status", **app.state.simulation.status()})
        while True:
            await ws.receive_text()  # we ignore client messages; this just detects disconnects
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
