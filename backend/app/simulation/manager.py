"""Lifecycle of the live simulation: one background asyncio task, started/stopped on demand.

Safety properties
* at most ONE simulation task exists (start() while running -> ConflictError);
* stop() sets an Event, waits for the task, and cancels it if it does not finish in time;
* app shutdown calls stop(), so no task or DB connection is left behind;
* a tick that raises is logged; after 5 consecutive failures the simulation stops itself.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.exceptions import ConflictError
from app.models import Incident, Intersection, Road, TrafficRecord, TrafficSignal
from app.services.incident_service import ACTIVE_STATUSES
from app.services.traffic_service import latest_records, make_record
from app.simulation.engine import TrafficSimulator
from app.simulation.network import SimNetwork
from app.algorithms.signal import SignalLimits

log = logging.getLogger("flowsense.simulation")
SEVERITY_CAPACITY_FACTOR = {"low": 0.9, "medium": 0.75, "high": 0.5, "critical": 0.3}
MAX_CONSECUTIVE_ERRORS = 5


class ConnectionHub:
    """Keeps track of WebSocket clients and broadcasts JSON to all of them."""

    def __init__(self):
        self.clients: set = set()

    async def connect(self, ws) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=2.0)
            except Exception:  # slow or closed client: drop it, never block the simulation
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


class SimulationManager:
    def __init__(self, session_factory: sessionmaker[Session], hub: ConnectionHub, settings: Settings):
        self.session_factory, self.hub, self.settings = session_factory, hub, settings
        self._task: asyncio.Task | None = None
        self._stop: asyncio.Event | None = None
        self.tick = 0
        self.sim_time: datetime | None = None
        self.config: dict = {}
        self.last_error: str | None = None
        self._sim: TrafficSimulator | None = None
        self._roads: dict[int, Road] = {}
        self._records_written = 0

    # ---- public API -------------------------------------------------------------------
    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def status(self) -> dict:
        return {
            "running": self.running, "data_source": "simulated", "tick": self.tick,
            "sim_time": self.sim_time.isoformat() if self.sim_time else None,
            "signal_mode": self.config.get("signal_mode"), "tick_interval_s": self.config.get("tick_interval_s"),
            "minutes_per_tick": self.config.get("minutes_per_tick"), "demand_multiplier": self.config.get("demand_multiplier"),
            "connected_clients": len(self.hub.clients), "last_error": self.last_error,
        }

    async def start(self, tick_interval_s: float | None, minutes_per_tick: float | None, signal_mode: str,
                    demand_multiplier: float, seed: int) -> dict:
        if self.running:
            raise ConflictError("The simulation is already running")
        self.config = {
            "tick_interval_s": tick_interval_s or self.settings.sim_tick_interval_s,
            "minutes_per_tick": minutes_per_tick or self.settings.sim_minutes_per_tick,
            "signal_mode": signal_mode, "demand_multiplier": demand_multiplier, "seed": seed,
        }
        self.last_error, self.tick = None, 0
        await asyncio.to_thread(self._init_sync)  # fail fast (e.g. empty database) before spawning the task
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="flowsense-simulation")
        log.info("Simulation started: %s", self.config)
        return self.status()

    async def stop(self) -> dict:
        if self._task is not None:
            if self._stop is not None:
                self._stop.set()
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except asyncio.TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except (asyncio.CancelledError, Exception):
                    pass
            self._task = None
            log.info("Simulation stopped after %d ticks", self.tick)
        return self.status()

    # ---- background loop ----------------------------------------------------------------
    async def _run(self) -> None:
        errors = 0
        try:
            while not self._stop.is_set():
                try:
                    payload = await asyncio.to_thread(self._tick_sync)
                    await self.hub.broadcast(payload)
                    errors = 0
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    self.last_error = f"{type(exc).__name__}: {exc}"
                    log.exception("Simulation tick failed (%d/%d)", errors, MAX_CONSECUTIVE_ERRORS)
                    if errors >= MAX_CONSECUTIVE_ERRORS:
                        break
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.config["tick_interval_s"])
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            log.info("Simulation task cancelled")
            raise

    # ---- synchronous DB work (runs in a worker thread) -------------------------------------
    def _init_sync(self) -> None:
        with self.session_factory() as db:
            nodes = {n.id: (n.latitude, n.longitude) for n in db.scalars(select(Intersection))}
            roads = list(db.scalars(select(Road).order_by(Road.id)))
            if not roads:
                raise ConflictError("The database has no road network. Run: python -m app.seed")
            self._roads = {r.id: r for r in roads}
            network = SimNetwork.from_specs(nodes, roads)
            s = self.settings
            limits = SignalLimits(s.signal_min_green_s, s.signal_max_green_s, s.signal_cycle_s, s.signal_lost_time_s)
            self._sim = TrafficSimulator(network, self.config["seed"], self.config["demand_multiplier"],
                                         signal_mode=self.config["signal_mode"], limits=limits)
            latest = latest_records(db)
            self._sim.set_vehicle_counts({rid: rec.vehicle_count for rid, rec in latest.items()})
            last_time = max((r.recorded_at for r in latest.values()), default=None)
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            self.sim_time = last_time or (now - timedelta(minutes=now.minute % 15))
            # Persist the chosen mode on every signal so the UI shows what is really running
            for sig in db.scalars(select(TrafficSignal)):
                sig.mode = self.config["signal_mode"]
            db.commit()

    def _tick_sync(self) -> dict:
        cfg, s = self.config, self.settings
        dt = cfg["minutes_per_tick"]
        with self.session_factory() as db:
            closed = {r.id for r in db.scalars(select(Road).where(Road.is_closed.is_(True)))}
            factors: dict[int, float] = {}
            for inc in db.scalars(select(Incident).where(Incident.status.in_(ACTIVE_STATUSES), Incident.road_id.is_not(None))):
                factors[inc.road_id] = min(factors.get(inc.road_id, 1.0), SEVERITY_CAPACITY_FACTOR[inc.severity])

            self.sim_time = self.sim_time + timedelta(minutes=dt)
            self.tick += 1
            self._sim.demand_multiplier = cfg["demand_multiplier"]
            states = self._sim.step(self.sim_time, dt, closed, factors)

            if self.tick % s.sim_record_every_ticks == 0:
                db.add_all(make_record(self._roads[rid], st.vehicle_count, st.average_speed, self.sim_time, st.density)
                           for rid, st in states.items() if rid not in closed)
                self._records_written += 1
                if self._records_written % 96 == 0:  # roughly once per simulated day
                    cutoff = self.sim_time - timedelta(days=s.traffic_retention_days)
                    db.execute(delete(TrafficRecord).where(TrafficRecord.recorded_at < cutoff))

            cycle = s.signal_cycle_s
            phase_clock = self.sim_time.timestamp() % cycle
            signals = []
            for sig in db.scalars(select(TrafficSignal)):
                greens = self._sim.signals.greens.get(sig.intersection_id)
                if greens:
                    sig.ns_green_s, sig.ew_green_s = greens["NS"], greens["EW"]
                sig.current_phase = "NS" if phase_clock < sig.ns_green_s else "EW"
                signals.append({"intersection_id": sig.intersection_id, "current_phase": sig.current_phase,
                                "ns_green_s": sig.ns_green_s, "ew_green_s": sig.ew_green_s, "mode": sig.mode})
            db.commit()

        roads_payload = [{
            "road_id": rid, "vehicle_count": st.vehicle_count, "average_speed": st.average_speed, "density": st.density,
            "occupancy": st.occupancy, "congestion_level": "closed" if rid in closed else st.congestion_level,
            "is_closed": rid in closed,
        } for rid, st in states.items()]
        open_states = [st for rid, st in states.items() if rid not in closed]
        n = len(open_states) or 1
        return {
            "type": "traffic_update", "data_source": "simulated", "tick": self.tick, "sim_time": self.sim_time.isoformat(),
            "summary": {
                "total_vehicles": sum(st.vehicle_count for st in open_states),
                "average_speed": round(sum(st.average_speed for st in open_states) / n, 1),
                "average_density": round(sum(st.density for st in open_states) / n, 2),
                "congested_roads": sum(1 for st in open_states if st.congestion_level in ("heavy", "severe")),
            },
            "roads": roads_payload, "signals": signals,
        }
