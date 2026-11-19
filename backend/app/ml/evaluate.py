"""Offline evaluation plots (Matplotlib). Saved as PNGs for the README and docs."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # no display needed
import matplotlib.pyplot as plt  # noqa: E402


def save_plots(artifact: dict, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    info, test = artifact["info"], artifact["test_frame"]
    paths: list[Path] = []

    fig, ax = plt.subplots(figsize=(5.5, 5))
    sample = test.sample(min(3000, len(test)), random_state=0)
    ax.scatter(sample["target_density"], sample["pred_density"], s=6, alpha=0.35)
    top = float(max(sample["target_density"].max(), sample["pred_density"].max()))
    ax.plot([0, top], [0, top], "r--", lw=1, label="perfect prediction")
    ax.set(xlabel="Actual density (veh/km/lane)", ylabel="Predicted density", title="Random Forest: actual vs predicted (test set)")
    ax.legend()
    paths.append(out_dir / "actual_vs_predicted.png")
    fig.tight_layout(); fig.savefig(paths[-1], dpi=140); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    imp = info["feature_importances"]
    ax.barh(list(imp)[::-1], list(imp.values())[::-1], color="#22a6d6")
    ax.set(xlabel="Importance", title="Feature importance")
    paths.append(out_dir / "feature_importance.png")
    fig.tight_layout(); fig.savefig(paths[-1], dpi=140); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 4))
    names = ["baseline_persistence", "baseline_historical_mean", "random_forest"]
    maes = [info["metrics"][n]["target_density"]["mae"] for n in names]
    ax.bar(["Persistence", "Historical mean", "Random Forest"], maes, color=["#8892a6", "#8892a6", "#22a6d6"])
    ax.set(ylabel="MAE of density (lower is better)", title=f"Model vs baselines ({info['horizon_minutes']} min ahead)")
    paths.append(out_dir / "model_vs_baselines.png")
    fig.tight_layout(); fig.savefig(paths[-1], dpi=140); plt.close(fig)
    return paths
