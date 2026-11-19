"""Adaptive traffic-signal logic.

Two parts:
1. `allocate_green`  - split the cycle's green time between phases in proportion to
                       "pressure" (queued vehicles), but never outside [min, max].
2. `simulate_intersection` - a small second-by-second queue simulation used to MEASURE
                       fixed-time vs adaptive control under identical arrivals.

Simplified two-phase model: phase "NS" serves north/south approaches, "EW" serves east/west.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

PHASES = ("NS", "EW")
YELLOW_ALL_RED_S = 4.0  # lost time after each green
SATURATION_VPH_PER_LANE = 1800.0


@dataclass(frozen=True)
class SignalLimits:
    min_green_s: float = 10.0
    max_green_s: float = 60.0
    cycle_s: float = 90.0
    lost_time_s: float = 8.0

    @property
    def available_green_s(self) -> float:
        return self.cycle_s - self.lost_time_s

    def validate(self, n_phases: int = 2) -> None:
        if self.min_green_s <= 0 or self.min_green_s > self.max_green_s:
            raise ValueError("Require 0 < min_green_s <= max_green_s")
        if n_phases * self.min_green_s > self.available_green_s:
            raise ValueError("Cycle too short for the minimum greens")
        if n_phases * self.max_green_s < self.available_green_s:
            raise ValueError("Cycle too long for the maximum greens")


def phase_for_bearing(bearing_deg: float) -> str:
    """Roads running within 45 degrees of north-south belong to phase NS, the rest to EW."""
    b = bearing_deg % 180.0
    return "NS" if (b < 45.0 or b >= 135.0) else "EW"


def estimate_queue(vehicle_count: float, occupancy: float) -> float:
    """Heuristic: the more crowded a road is, the larger the share of its vehicles that is standing.

    No queue below ~10 % occupancy, everything queued at jam density. This is an *estimate*;
    we have no stop-line detectors in the data.
    """
    share = min(1.0, max(0.0, (occupancy - 0.10) / 0.90))
    return vehicle_count * share


def allocate_green(pressures: dict[str, float], limits: SignalLimits) -> dict[str, float]:
    """Bounded proportional allocation of green time.

    Input : pressure per phase (>= 0), limits.
    Output: green seconds per phase; every value lies in [min_green_s, max_green_s] and the values
            sum to cycle_s - lost_time_s whenever that is feasible.
    Method: allocate proportionally; if some phase violates a bound, clamp the WORST violator,
            remove it, and re-split the remaining time among the others (water-filling).
    Time  : O(p^2) for p phases (p = 2 here).
    """
    limits.validate(len(pressures))
    free = {k: max(0.0, float(v)) for k, v in pressures.items()}
    alloc: dict[str, float] = {}
    remaining = limits.available_green_s
    while free:
        total = sum(free.values())
        proposal = {k: (remaining * v / total if total > 0 else remaining / len(free)) for k, v in free.items()}
        violations = {
            k: (limits.min_green_s - p if p < limits.min_green_s else p - limits.max_green_s)
            for k, p in proposal.items()
            if p < limits.min_green_s or p > limits.max_green_s
        }
        if not violations:
            alloc.update(proposal)
            break
        worst = max(violations, key=violations.get)
        alloc[worst] = min(limits.max_green_s, max(limits.min_green_s, proposal[worst]))
        remaining -= alloc[worst]
        del free[worst]
    return {k: round(v, 1) for k, v in alloc.items()}


def fixed_allocation(limits: SignalLimits, phases: tuple[str, ...] = PHASES) -> dict[str, float]:
    """Fixed-time plan: equal green for every phase."""
    return allocate_green({p: 1.0 for p in phases}, limits)


# ---------------------------------------------------------------------------
# Intersection micro-simulation
# ---------------------------------------------------------------------------
@dataclass
class ApproachSpec:
    name: str
    phase: str  # "NS" or "EW"
    arrival_vph: float
    lanes: int = 1
    initial_queue: int = 0


SCENARIOS = {
    # (NS multiplier, EW multiplier) for the first and second half of the run
    "live": ((1.0, 1.0), (1.0, 1.0)),
    "balanced": ((1.0, 1.0), (1.0, 1.0)),
    "ns_heavy": ((1.6, 0.6), (1.6, 0.6)),
    "shifting": ((1.6, 0.5), (0.5, 1.6)),
}


def simulate_intersection(approaches: list[ApproachSpec], strategy: str, limits: SignalLimits,
                          duration_s: int = 3600, seed: int = 42, scenario: str = "live",
                          series_step_s: int = 60) -> dict:
    """Second-by-second queue simulation of one signalised intersection.

    * Arrivals are Poisson and drawn from `seed` BEFORE the strategy is applied, so "fixed"
      and "adaptive" always face exactly the same vehicles (fair comparison).
    * Each green second discharges up to saturation-flow x lanes vehicles from queues of the green phase.
    * "fixed"    -> equal green split every cycle.
    * "adaptive" -> at the start of each cycle, green is split in proportion to queued vehicles (+1 smoothing),
                    bounded by `limits`.
    Metrics: average waiting time per vehicle (vehicles still queued at the end count their wait so
    far), throughput (vehicles discharged), mean/max queue, final queue.
    Time: O(duration_s x approaches).
    """
    if strategy not in ("fixed", "adaptive"):
        raise ValueError("strategy must be 'fixed' or 'adaptive'")
    if scenario not in SCENARIOS:
        raise ValueError(f"scenario must be one of {sorted(SCENARIOS)}")
    limits.validate(2)
    rng = np.random.default_rng(seed)
    half = duration_s // 2
    mult_first, mult_second = SCENARIOS[scenario]

    # Pre-draw arrivals per approach per second (independent of strategy)
    arrivals: list[np.ndarray] = []
    for a in approaches:
        idx = 0 if a.phase == "NS" else 1
        rate = np.full(duration_s, a.arrival_vph * mult_first[idx] / 3600.0)
        rate[half:] = a.arrival_vph * mult_second[idx] / 3600.0
        arrivals.append(rng.poisson(rate))

    queues: list[deque] = [deque([0] * a.initial_queue) for a in approaches]  # each item = arrival second
    credit = [0.0] * len(approaches)
    waits_total = 0.0
    departed = 0
    arrived = sum(a.initial_queue for a in approaches)
    queue_sum = 0
    max_queue = 0
    series: list[dict] = []

    # Adaptive pressure of a phase = vehicles that arrived for it during the previous cycle
    # + vehicles its green left unserved. Reading the raw queue at cycle start would be biased
    # towards whichever phase was served last (its queue has just been cleared) and makes the
    # split oscillate.
    arrivals_cycle = {"NS": 0, "EW": 0}
    leftover = {p: float(sum(a.initial_queue for a in approaches if a.phase == p)) for p in PHASES}
    pressure_state = dict(leftover)

    def queue_of(phase: str) -> int:
        return sum(len(q) for a, q in zip(approaches, queues) if a.phase == phase)

    t = 0
    while t < duration_s:
        if strategy == "fixed":
            plan = fixed_allocation(limits)
        else:
            plan = allocate_green({p: pressure_state[p] + 1.0 for p in PHASES}, limits)
        arrivals_cycle = {"NS": 0, "EW": 0}
        for phase in PHASES:
            green_end = min(duration_s, t + int(round(plan[phase])))
            lost_end = min(duration_s, green_end + int(YELLOW_ALL_RED_S))
            for sec in range(t, lost_end):
                for i, a in enumerate(approaches):
                    n = int(arrivals[i][sec])
                    if n:
                        queues[i].extend([sec] * n)
                        arrived += n
                        arrivals_cycle[a.phase] += n
                    if sec < green_end and a.phase == phase and queues[i]:
                        credit[i] += SATURATION_VPH_PER_LANE * a.lanes / 3600.0
                        while credit[i] >= 1.0 and queues[i]:
                            waits_total += sec - queues[i].popleft()
                            departed += 1
                            credit[i] -= 1.0
                    elif a.phase == phase and sec < green_end:
                        credit[i] = 0.0  # no queue: unused green is wasted
                total_q = sum(len(q) for q in queues)
                queue_sum += total_q
                max_queue = max(max_queue, total_q)
                if sec % series_step_s == 0:
                    series.append({"t": sec, "queue": total_q})
                if sec == green_end - 1:
                    leftover[phase] = float(queue_of(phase))
            t = lost_end
            if t >= duration_s:
                break
        pressure_state = {p: arrivals_cycle[p] + leftover[p] for p in PHASES}

    residual_wait = sum(duration_s - s for q in queues for s in q)
    final_queue = sum(len(q) for q in queues)
    return {
        "strategy": strategy,
        "avg_wait_s": round((waits_total + residual_wait) / arrived, 2) if arrived else 0.0,
        "throughput": departed,
        "avg_queue": round(queue_sum / duration_s, 2),
        "max_queue": max_queue,
        "final_queue": final_queue,
        "vehicles_arrived": arrived,
        "queue_series": series,
    }


def pct_change(before: float, after: float) -> float | None:
    """Positive = `after` is higher. None when `before` is zero."""
    if before == 0:
        return None
    return round((after - before) / before * 100.0, 1)
