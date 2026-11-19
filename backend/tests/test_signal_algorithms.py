"""Green-time allocation limits and the measured fixed-vs-adaptive comparison."""
import random
import statistics

import pytest

from app.algorithms.signal import (ApproachSpec, SignalLimits, allocate_green, estimate_queue, fixed_allocation,
                                   phase_for_bearing, simulate_intersection)

LIMITS = SignalLimits(min_green_s=10, max_green_s=60, cycle_s=90, lost_time_s=8)


def test_fixed_allocation_is_equal_and_sums_to_available_green():
    plan = fixed_allocation(LIMITS)
    assert plan == {"NS": 41.0, "EW": 41.0}


def test_green_always_within_limits_and_sums_exactly():
    rng = random.Random(0)
    for _ in range(500):
        p = {"NS": rng.choice([0, rng.uniform(0, 500)]), "EW": rng.choice([0, rng.uniform(0, 500)])}
        plan = allocate_green(p, LIMITS)
        assert all(LIMITS.min_green_s <= g <= LIMITS.max_green_s for g in plan.values()), (p, plan)
        assert sum(plan.values()) == pytest.approx(LIMITS.available_green_s, abs=0.2), (p, plan)


def test_extreme_pressure_hits_the_maximum_not_beyond():
    plan = allocate_green({"NS": 1000, "EW": 0}, LIMITS)
    assert plan["NS"] == 60.0 and plan["EW"] == 22.0


def test_more_pressure_gets_more_green():
    plan = allocate_green({"NS": 60, "EW": 20}, LIMITS)
    assert plan["NS"] > plan["EW"]


def test_zero_pressure_splits_equally():
    assert allocate_green({"NS": 0, "EW": 0}, LIMITS) == {"NS": 41.0, "EW": 41.0}


def test_invalid_limits_rejected():
    with pytest.raises(ValueError):
        SignalLimits(min_green_s=50, max_green_s=60, cycle_s=90, lost_time_s=8).validate(2)  # 2*50 > 82
    with pytest.raises(ValueError):
        SignalLimits(min_green_s=5, max_green_s=30, cycle_s=120, lost_time_s=8).validate(2)  # 2*30 < 112


def test_phase_for_bearing():
    assert [phase_for_bearing(b) for b in (0, 10, 170, 180, 350)] == ["NS"] * 5
    assert [phase_for_bearing(b) for b in (90, 270, 60, 120)] == ["EW"] * 4


def test_queue_estimate_bounds():
    assert estimate_queue(50, 0.05) == 0
    assert estimate_queue(100, 1.0) == 100
    assert 0 < estimate_queue(100, 0.5) < 100


APPROACHES = [ApproachSpec("N", "NS", 500), ApproachSpec("S", "NS", 500), ApproachSpec("E", "EW", 500), ApproachSpec("W", "EW", 500)]


def test_same_seed_means_same_vehicles_for_both_strategies():
    f = simulate_intersection(APPROACHES, "fixed", LIMITS, 1800, seed=5, scenario="shifting")
    a = simulate_intersection(APPROACHES, "adaptive", LIMITS, 1800, seed=5, scenario="shifting")
    assert f["vehicles_arrived"] == a["vehicles_arrived"]  # fair comparison


def test_simulation_is_deterministic():
    r1 = simulate_intersection(APPROACHES, "adaptive", LIMITS, 1200, seed=9, scenario="ns_heavy")
    r2 = simulate_intersection(APPROACHES, "adaptive", LIMITS, 1200, seed=9, scenario="ns_heavy")
    assert r1 == r2


def test_conservation_of_vehicles():
    r = simulate_intersection(APPROACHES, "fixed", LIMITS, 1800, seed=1, scenario="live")
    assert r["throughput"] + r["final_queue"] == r["vehicles_arrived"]


def _mean_wait(strategy, scenario, seeds=range(6)):
    return statistics.mean(simulate_intersection(APPROACHES, strategy, LIMITS, 3600, s, scenario)["avg_wait_s"] for s in seeds)


@pytest.mark.parametrize("scenario", ["ns_heavy", "shifting"])
def test_adaptive_beats_fixed_when_demand_is_unbalanced(scenario):
    """MEASURED, not assumed: averaged over 6 random seeds adaptive waits clearly less."""
    assert _mean_wait("adaptive", scenario) < 0.8 * _mean_wait("fixed", scenario)


def test_adaptive_is_not_worse_when_demand_is_balanced():
    fixed, adaptive = _mean_wait("fixed", "balanced"), _mean_wait("adaptive", "balanced")
    assert adaptive <= fixed * 1.15  # no meaningful loss
