"""Warmup ramp schedule — pure functions, no DB.

Per spec §2 (warmpulse-architecture.html ramp table):
    D1–3  -> 5/day
    D4–7  -> 10/day
    D8–14 -> 20/day
    D15–21 -> 35/day
    D22–28 -> 50/day
    D29+  -> `daily_target` (caller's ceiling, typically 50–100)

Each tier is capped by ``daily_target`` so a client who chose a conservative
50/day cap never climbs above it during the early ramp either.
"""
from __future__ import annotations


def ramp_target(current_day: int, daily_target: int) -> int:
    """Return emails-to-send for a mailbox on its ``current_day`` of warmup.

    ``current_day`` is 1-based. Day 0 (or negative) means warmup hasn't
    started — returns 0 so no work is scheduled.
    """
    if current_day <= 0:
        return 0
    if current_day <= 3:
        return min(5, daily_target)
    if current_day <= 7:
        return min(10, daily_target)
    if current_day <= 14:
        return min(20, daily_target)
    if current_day <= 21:
        return min(35, daily_target)
    if current_day <= 28:
        return min(50, daily_target)
    return daily_target


def ramp_schedule(daily_target: int, days: int = 35) -> list[int]:
    """Return the daily send-count schedule for the first ``days`` days."""
    return [ramp_target(d, daily_target) for d in range(1, days + 1)]
