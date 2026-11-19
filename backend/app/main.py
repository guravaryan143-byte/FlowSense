"""FastAPI application factory."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
from sqlalchemy.orm import Session, sessionmaker

from app.api import ws
from app.api.routers import (accidents, analytics, auth, health, incidents, predictions, routes, signals, simulation,
                             traffic)
from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.core.logging import configure_logging
from app.core.rate_limit import FailureLimiter
from app.database.session import get_session_factory
from app.ml.model_store import ModelStore
from app.simulation.manager import ConnectionHub, SimulationManager

log = logging.getLogger("flowsense")


def create_app(session_factory: sessionmaker[Session] | None = None, model_dir: Path | None = None) -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await app.state.simulation.stop()  # no orphaned background task on shutdown

    app = FastAPI(title="FlowSense API", version="1.0.0", lifespan=lifespan,
                  description="AI-powered city traffic intelligence. ALL traffic data is simulated.")
    app.state.session_factory = session_factory or get_session_factory()
    app.state.model_store = ModelStore(model_dir or settings.model_dir)
    app.state.hub = ConnectionHub()
    app.state.simulation = SimulationManager(app.state.session_factory, app.state.hub, settings)
    app.state.login_limiter = FailureLimiter()
    app.state.allowed_origins = set(settings.cors_origin_list)

    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
                       allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse({"error": exc.code, "message": exc.message}, status_code=exc.status_code, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        # Default FastAPI output echoes the submitted values (e.g. passwords). Return only where and why.
        details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
        return JSONResponse({"error": "validation_error", "message": "Invalid request", "details": details}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse({"error": "internal_error", "message": "Something went wrong on the server"}, status_code=500)

    for r in (health.router, auth.router, traffic.router, predictions.router, signals.router, routes.router,
              accidents.router, incidents.router, analytics.router, simulation.router):
        app.include_router(r, prefix="/api")
    app.include_router(ws.router)
    return app


def app_factory() -> FastAPI:  # for `uvicorn app.main:app_factory --factory`
    return create_app()


# `uvicorn app.main:app` convenience. Created lazily so that importing this module (e.g. in tests)
# never requires a database or secret key.
def __getattr__(name: str):
    if name == "app":
        return create_app()
    raise AttributeError(name)
