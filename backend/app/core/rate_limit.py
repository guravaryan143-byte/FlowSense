"""Tiny in-process limiter for failed logins (per email+IP). Resets on restart; fine for one instance."""
import time
from collections import defaultdict


class FailureLimiter:
    def __init__(self, max_failures: int = 5, window_s: float = 900.0):
        self.max_failures, self.window_s = max_failures, window_s
        self._failures: dict[str, list[float]] = defaultdict(list)

    def _recent(self, key: str) -> list[float]:
        cutoff = time.monotonic() - self.window_s
        self._failures[key] = [t for t in self._failures[key] if t > cutoff]
        return self._failures[key]

    def blocked(self, key: str) -> bool:
        return len(self._recent(key)) >= self.max_failures

    def record_failure(self, key: str) -> None:
        self._recent(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)
