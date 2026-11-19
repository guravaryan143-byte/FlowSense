"""Reproduce the fixed-vs-adaptive signal comparison quoted in the README.

    python -m app.simulation.benchmark_signals
Four single-lane approaches (N, S, E, W) at 500 veh/h each, one simulated hour, 10 random seeds per scenario.
Both strategies see EXACTLY the same arrivals for a given seed.
"""
import statistics

from app.algorithms.signal import ApproachSpec, SignalLimits, simulate_intersection

LIMITS = SignalLimits(10, 60, 90, 8)
APPROACHES = [ApproachSpec("N", "NS", 500), ApproachSpec("S", "NS", 500), ApproachSpec("E", "EW", 500), ApproachSpec("W", "EW", 500)]


def main(seeds: int = 10) -> None:
    print(f"{'scenario':10s} {'fixed wait':>11s} {'adaptive wait':>14s} {'change':>8s}   {'fixed thr.':>10s} {'adaptive thr.':>13s}")
    for scenario in ("balanced", "ns_heavy", "shifting"):
        res = {s: [simulate_intersection(APPROACHES, s, LIMITS, 3600, seed, scenario) for seed in range(seeds)] for s in ("fixed", "adaptive")}
        fw = statistics.mean(r["avg_wait_s"] for r in res["fixed"])
        aw = statistics.mean(r["avg_wait_s"] for r in res["adaptive"])
        ft = statistics.mean(r["throughput"] for r in res["fixed"])
        at = statistics.mean(r["throughput"] for r in res["adaptive"])
        print(f"{scenario:10s} {fw:9.1f} s {aw:12.1f} s {(aw - fw) / fw * 100:+7.1f}%   {ft:10.0f} {at:13.0f}")


if __name__ == "__main__":
    main()
