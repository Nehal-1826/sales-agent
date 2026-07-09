"""In-process rolling telemetry buffers.

The /admin/system-health endpoint reads from these to surface p50/p95/p99
API latency and a top-N error-class breakdown without depending on an
external metrics stack. Two buffers:

* ``LatencySink`` — a fixed-size ring of (epoch_seconds, duration_ms).
  Drops samples older than ``window_s`` on each percentile read.
* ``ErrorSink`` — a fixed-size ring of (epoch_seconds, exception_class).
  Aggregates into ``[(class, count), ...]`` on read, optionally filtered
  to the last ``window_s``.

Both buffers are thread-safe. They are deliberately bounded — under heavy
traffic the oldest samples just get evicted, no unbounded memory growth.

These are process-local; in a multi-worker deployment each worker keeps
its own buffer. That's fine for an admin dashboard (one curl hits one
worker; the operator sees that worker's view) but if you ever want a
fleet-wide aggregate, point Prometheus at /metrics instead.
"""
from __future__ import annotations

import threading
import time
from collections import Counter, deque
from typing import Iterable


class LatencySink:
    """Ring buffer of recent request durations with percentile readout."""

    def __init__(self, capacity: int = 4096, window_s: float = 900.0) -> None:
        self._buf: deque[tuple[float, float]] = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._window_s = window_s

    def record(self, duration_ms: float) -> None:
        with self._lock:
            self._buf.append((time.monotonic(), duration_ms))

    def _samples_in_window(self) -> list[float]:
        cutoff = time.monotonic() - self._window_s
        with self._lock:
            return [d for ts, d in self._buf if ts >= cutoff]

    def percentiles(self) -> dict[str, float]:
        samples = sorted(self._samples_in_window())
        if not samples:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "n": 0}
        return {
            "p50": _quantile(samples, 0.50),
            "p95": _quantile(samples, 0.95),
            "p99": _quantile(samples, 0.99),
            "n": len(samples),
        }

    def series(self, buckets: int = 30) -> list[dict[str, float]]:
        """Return a coarse time-series of mean latency per bucket.

        Used for the chart under the latency KPI tiles. Buckets divide the
        window evenly; empty buckets show 0 so the line stays continuous.
        """
        cutoff = time.monotonic() - self._window_s
        bucket_size = max(self._window_s / max(buckets, 1), 1.0)
        with self._lock:
            samples = [(ts, d) for ts, d in self._buf if ts >= cutoff]
        out: list[dict[str, float]] = []
        now_mono = time.monotonic()
        wall_now = time.time()
        for i in range(buckets):
            mono_lo = cutoff + i * bucket_size
            mono_hi = mono_lo + bucket_size
            in_bucket = [d for ts, d in samples if mono_lo <= ts < mono_hi]
            wall_t = wall_now - (now_mono - mono_lo)
            out.append(
                {
                    "t": _isoformat(wall_t),
                    "p50": _quantile(sorted(in_bucket), 0.50) if in_bucket else 0.0,
                    "p95": _quantile(sorted(in_bucket), 0.95) if in_bucket else 0.0,
                    "p99": _quantile(sorted(in_bucket), 0.99) if in_bucket else 0.0,
                }
            )
        return out


class ErrorSink:
    """Ring buffer of recent exception class names + counts."""

    def __init__(self, capacity: int = 1024, window_s: float = 86400.0) -> None:
        self._buf: deque[tuple[float, str]] = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._window_s = window_s

    def record(self, exc: BaseException) -> None:
        with self._lock:
            self._buf.append((time.monotonic(), exc.__class__.__name__))

    def top(self, limit: int = 10) -> list[dict[str, object]]:
        cutoff = time.monotonic() - self._window_s
        with self._lock:
            recent = [name for ts, name in self._buf if ts >= cutoff]
        counts: Counter[str] = Counter(recent)
        return [{"type": k, "count": v} for k, v in counts.most_common(limit)]


def _quantile(sorted_samples: Iterable[float], q: float) -> float:
    samples = list(sorted_samples)
    if not samples:
        return 0.0
    idx = max(0, min(len(samples) - 1, int(round(q * (len(samples) - 1)))))
    return float(samples[idx])


def _isoformat(epoch: float) -> str:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(epoch, tz=UTC).isoformat()


# Module-level singletons. Keep the names short — every middleware request
# hits LATENCY.record() so attribute lookup matters a little.
LATENCY = LatencySink()
ERRORS = ErrorSink()
