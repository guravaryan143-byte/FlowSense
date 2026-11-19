"""Headless simulation -> pandas DataFrame / CSV. Used for the ML dataset and for seeding history."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from app.simulation.engine import TrafficSimulator
from app.simulation.network import sample_network

DISRUPTION_FACTORS = (0.4, 0.55, 0.7)


def generate_history(days: int = 28, end_time: datetime | None = None, seed: int = 42, signal_mode: str = "fixed",
                     step_minutes: int = 5, record_every: int = 3, warmup_days: int = 1,
                     disruptions: bool = True) -> pd.DataFrame:
    """Run the simulator offline and return one row per road per recorded step.

    Records are written every `step_minutes * record_every` minutes (default 15). Random capacity
    disruptions (30-90 min) mimic breakdowns and are NOT visible to the ML model as a feature,
    exactly like unforeseeable events in real life.
    """
    _, _, network = sample_network()
    sim = TrafficSimulator(network, seed=seed, signal_mode=signal_mode)
    rng = np.random.default_rng(seed + 1)
    end_time = (end_time or datetime.now(timezone.utc)).replace(second=0, microsecond=0, tzinfo=timezone.utc)
    end_time -= timedelta(minutes=end_time.minute % (step_minutes * record_every))
    total_ticks = int((days + warmup_days) * 24 * 60 / step_minutes)
    start_time = end_time - timedelta(minutes=total_ticks * step_minutes)

    active: dict[int, tuple[float, int]] = {}  # road_id -> (factor, ticks_left)
    road_ids = list(network.roads)
    rows: list[tuple] = []
    for tick in range(1, total_ticks + 1):
        t = start_time + timedelta(minutes=tick * step_minutes)
        if disruptions:
            active = {r: (f, left - 1) for r, (f, left) in active.items() if left > 1}
            if rng.random() < 0.02:  # ~ one new disruption every 4 hours of sim time
                active[int(rng.choice(road_ids))] = (float(rng.choice(DISRUPTION_FACTORS)), int(rng.integers(6, 19)))
        factors = {r: f for r, (f, _) in active.items()}
        state = sim.step(t, step_minutes, capacity_factor=factors)
        if tick > warmup_days * 24 * 60 / step_minutes and tick % record_every == 0:
            for rid, s in state.items():
                rows.append((rid, t, s.vehicle_count, s.average_speed, s.density, s.congestion_level))
    return pd.DataFrame(rows, columns=["road_id", "recorded_at", "vehicle_count", "average_speed", "density", "congestion_level"])


def inject_sensor_dropouts(df: pd.DataFrame, rate: float = 0.015, seed: int = 0) -> pd.DataFrame:
    """Blank out some readings, like failed detectors. Exercises the ML cleaning code."""
    rng = np.random.default_rng(seed)
    out = df.copy()
    for col in ("vehicle_count", "average_speed"):
        out.loc[rng.random(len(out)) < rate, col] = np.nan
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Generate the simulated FlowSense training dataset")
    p.add_argument("--days", type=int, default=28)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", type=Path, default=Path("../datasets/traffic_synthetic.csv"))
    p.add_argument("--end", type=str, default="2026-11-01T00:00:00", help="UTC end timestamp (ISO). Fixed => reproducible")
    p.add_argument("--dropout", type=float, default=0.015)
    args = p.parse_args()
    end = datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc)
    df = inject_sensor_dropouts(generate_history(args.days, end, args.seed), args.dropout, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df):,} rows ({df.road_id.nunique()} roads) to {args.out} — SIMULATED data, seed={args.seed}")


if __name__ == "__main__":
    main()
