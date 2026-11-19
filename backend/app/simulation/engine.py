"""Macroscopic 'store-and-forward' traffic simulator (pure Python, no database).

Each road holds a number of vehicles. Every tick:
  1. new vehicles enter from outside, following a time-of-day demand profile;
  2. each road can send out a limited number of vehicles (signal green share x saturation flow x incident factor);
  3. departing vehicles either leave the network or move to connected roads, but only as many as the
     receiving roads have space for (blocked vehicles stay -> queues spill back);
  4. speed follows Greenshields' model: v = v_free * (1 - k / k_jam).

Vehicles are conserved except where they enter from or leave to the outside world.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from app.algorithms.signal import SATURATION_VPH_PER_LANE, SignalLimits, allocate_green, estimate_queue, fixed_allocation
from app.simulation.network import JAM_DENSITY_PER_LANE_KM, SimNetwork

EXIT_PROBABILITY = 0.25  # share of departing vehicles whose trip ends at the next junction
MIN_SPEED_FRACTION = 0.08


def classify_occupancy(occupancy: float) -> str:
    """Congestion category from occupancy = vehicles / jam capacity.

    Because speed ~ v_free * (1 - occupancy) (Greenshields), these bands correspond to
    speed above 75 %, 50-75 %, 25-50 % and below 25 % of free-flow speed.
    """
    if occupancy < 0.25:
        return "free_flow"
    if occupancy < 0.50:
        return "moderate"
    if occupancy < 0.75:
        return "heavy"
    return "severe"


def demand_profile(sim_time: datetime) -> float:
    """Multiplier for external demand (~0.2 at night, ~1.1 at the evening peak). Weekends are flatter."""
    h = sim_time.hour + sim_time.minute / 60.0

    def bump(centre: float, width: float) -> float:
        return math.exp(-0.5 * ((h - centre) / width) ** 2)

    if sim_time.weekday() >= 5:
        return 0.15 + 0.50 * bump(13.5, 3.5) + 0.20 * bump(19.0, 2.0)
    return 0.18 + 0.85 * bump(8.5, 1.4) + 0.95 * bump(18.0, 1.7) + 0.35 * bump(13.0, 2.5)


@dataclass
class RoadState:
    road_id: int
    vehicle_count: int
    average_speed: float  # km/h
    density: float  # vehicles / km / lane
    occupancy: float
    congestion_level: str


def speed_from_density(density_per_lane: float, free_speed_kmh: float) -> float:
    return free_speed_kmh * max(MIN_SPEED_FRACTION, 1.0 - density_per_lane / JAM_DENSITY_PER_LANE_KM)


class SignalController:
    """Computes the green share of every (node, phase) for the whole network."""

    def __init__(self, network: SimNetwork, mode: str = "fixed", limits: SignalLimits | None = None):
        if mode not in ("fixed", "adaptive"):
            raise ValueError("mode must be 'fixed' or 'adaptive'")
        self.network, self.mode = network, mode
        self.limits = limits or SignalLimits()
        self.greens: dict[int, dict[str, float]] = {n: fixed_allocation(self.limits) for n in network.node_roads}

    def update(self, vehicles: dict[int, float]) -> dict[int, dict[str, float]]:
        if self.mode == "adaptive":
            for node, road_ids in self.network.node_roads.items():
                pressure = {"NS": 1.0, "EW": 1.0}
                for rid in road_ids:
                    r = self.network.roads[rid]
                    group = r.group_u if r.u == node else r.group_v
                    occ = vehicles[rid] / r.capacity
                    pressure[group] += estimate_queue(vehicles[rid], occ)
                self.greens[node] = allocate_green(pressure, self.limits)
        return self.greens

    def share(self, node: int, group: str) -> float:
        return self.greens[node][group] / self.limits.cycle_s


class TrafficSimulator:
    def __init__(self, network: SimNetwork, seed: int = 42, demand_multiplier: float = 1.0,
                 initial_occupancy: float = 0.08, signal_mode: str = "fixed", limits: SignalLimits | None = None):
        self.network = network
        self.rng = np.random.default_rng(seed)
        self.demand_multiplier = demand_multiplier
        self.vehicles: dict[int, float] = {rid: initial_occupancy * r.capacity for rid, r in network.roads.items()}
        self.signals = SignalController(network, signal_mode, limits)

    def set_vehicle_counts(self, counts: dict[int, float]) -> None:
        for rid, n in counts.items():
            if rid in self.vehicles:
                self.vehicles[rid] = float(n)

    def step(self, sim_time: datetime, dt_min: float = 5.0, closed: set[int] | None = None,
             capacity_factor: dict[int, float] | None = None) -> dict[int, RoadState]:
        closed = closed or set()
        capacity_factor = capacity_factor or {}
        net, veh = self.network, self.vehicles
        profile = demand_profile(sim_time) * self.demand_multiplier
        self.signals.update(veh)

        # Closed roads lose their vehicles; their external demand is shared by open neighbours.
        for rid in closed:
            if rid in veh:
                veh[rid] = 0.0
        extra_demand: dict[int, float] = {rid: 0.0 for rid in net.roads}
        for rid in closed:
            r = net.roads.get(rid)
            if r is None:
                continue
            neigh = [n for node in (r.u, r.v) for n in net.node_roads[node] if n != rid and n not in closed]
            for n in neigh:
                extra_demand[n] += r.base_demand_vpm / max(1, len(neigh))

        # 2. how many vehicles each road may send out this tick
        send: dict[int, float] = {}
        for rid, r in net.roads.items():
            if rid in closed:
                send[rid] = 0.0
                continue
            share = 0.5 * (self.signals.share(r.u, r.group_u) + self.signals.share(r.v, r.group_v))
            sat = SATURATION_VPH_PER_LANE * r.lanes / 60.0 * dt_min  # vehicles per tick at 100 % green
            occ = veh[rid] / r.capacity
            factor = capacity_factor.get(rid, 1.0)
            # discharge degrades when the road is jammed (queue spillback / start-up delays)
            send[rid] = min(veh[rid], sat * share * factor * max(0.25, 1.0 - 0.6 * occ))

        # 3. split departures between exit / neighbours, respecting receiving space
        desired: dict[int, dict[int, float]] = {rid: {} for rid in net.roads}
        exits: dict[int, float] = {}
        for rid, out in send.items():
            r = net.roads[rid]
            exits[rid] = out * EXIT_PROBABILITY
            moving = out - exits[rid]
            for node in (r.u, r.v):
                options = [n for n in net.node_roads[node] if n != rid and n not in closed]
                if not options:  # dead end because of closures: vehicles leave the model
                    exits[rid] += moving / 2
                    continue
                weights = np.array([net.roads[n].lanes for n in options], dtype=float)
                for n, w in zip(options, weights / weights.sum()):
                    desired[rid][n] = desired[rid].get(n, 0.0) + moving / 2 * w

        incoming: dict[int, float] = {rid: 0.0 for rid in net.roads}
        for rid, targets in desired.items():
            for n, amount in targets.items():
                incoming[n] += amount
        accept: dict[int, float] = {}
        for rid, r in net.roads.items():
            space = max(0.0, 0.98 * r.capacity - veh[rid] + send[rid])  # space after own departures
            accept[rid] = 1.0 if incoming[rid] <= space or incoming[rid] == 0 else space / incoming[rid]

        new_veh = dict(veh)
        for rid, targets in desired.items():
            moved_ok = 0.0
            for n, amount in targets.items():
                actual = amount * accept[n]
                new_veh[n] += actual
                moved_ok += actual
            blocked = sum(targets.values()) - moved_ok
            new_veh[rid] -= send[rid] - blocked  # blocked vehicles stay on their road

        # 1. external demand (limited by remaining space)
        for rid, r in net.roads.items():
            if rid in closed:
                new_veh[rid] = 0.0
                continue
            lam = (r.base_demand_vpm * profile + extra_demand[rid]) * dt_min
            lam *= float(self.rng.normal(1.0, 0.08))
            space = max(0.0, 0.98 * r.capacity - new_veh[rid])
            new_veh[rid] = min(r.capacity * 0.98, new_veh[rid] + min(max(0.0, lam), space))

        self.vehicles = new_veh
        return self.snapshot(capacity_factor, closed)

    def snapshot(self, capacity_factor: dict[int, float] | None = None, closed: set[int] | None = None) -> dict[int, RoadState]:
        capacity_factor = capacity_factor or {}
        out: dict[int, RoadState] = {}
        for rid, r in self.network.roads.items():
            n = max(0.0, self.vehicles[rid])
            density = n / ((r.length_m / 1000.0) * r.lanes)
            speed = speed_from_density(density, r.speed_limit_kmh) * capacity_factor.get(rid, 1.0)
            speed *= float(self.rng.normal(1.0, 0.03))
            speed = min(r.speed_limit_kmh, max(2.0, speed))
            occ = n / r.capacity
            out[rid] = RoadState(rid, int(round(n)), round(speed, 1), round(density, 2), round(occ, 4),
                                 classify_occupancy(occ))
        return out
