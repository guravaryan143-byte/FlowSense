"""Loads the trained model lazily and survives its absence ('graceful when not trained')."""
from __future__ import annotations

import logging
from pathlib import Path
from threading import Lock

import joblib

from app.core.exceptions import ModelNotTrainedError
from app.ml.train import MODEL_FILE

log = logging.getLogger("flowsense.ml")


class ModelStore:
    """Caches the artifact and reloads it automatically if the file changes (e.g. after retraining).

    Security note: joblib files are pickles. Only ever load them from a directory YOU control.
    """

    def __init__(self, model_dir: Path):
        self.path = Path(model_dir) / MODEL_FILE
        self._artifact: dict | None = None
        self._mtime: float | None = None
        self._lock = Lock()

    def _refresh(self) -> dict | None:
        with self._lock:
            if not self.path.exists():
                self._artifact, self._mtime = None, None
                return None
            mtime = self.path.stat().st_mtime
            if self._artifact is None or mtime != self._mtime:
                try:
                    self._artifact = joblib.load(self.path)
                    self._mtime = mtime
                    log.info("Loaded model %s", self._artifact["info"]["version"])
                except Exception:  # corrupt/incompatible file must not crash the API
                    log.exception("Could not load model file %s", self.path)
                    self._artifact, self._mtime = None, None
            return self._artifact

    def is_available(self) -> bool:
        return self._refresh() is not None

    def get(self) -> dict:
        artifact = self._refresh()
        if artifact is None:
            raise ModelNotTrainedError("The congestion model has not been trained yet. Run: python -m app.ml.train")
        return artifact

    def info(self) -> dict | None:
        artifact = self._refresh()
        return artifact["info"] if artifact else None
