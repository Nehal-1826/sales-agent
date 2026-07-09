"""Tests for the ramp schedule."""
from __future__ import annotations

import pytest

from app.services.warmup.ramp import ramp_schedule, ramp_target


@pytest.mark.parametrize(
    "day,expected",
    [
        (0, 0),
        (1, 5),
        (3, 5),
        (4, 10),
        (7, 10),
        (8, 20),
        (14, 20),
        (15, 35),
        (21, 35),
        (22, 50),
        (28, 50),
        (29, 100),
        (40, 100),
    ],
)
def test_ramp_target_table(day: int, expected: int) -> None:
    """Spec §2: tier boundaries must match the published ramp."""
    assert ramp_target(day, daily_target=100) == expected


def test_ramp_target_caps_at_daily_target() -> None:
    """A client with a 15/day ceiling should never exceed 15, even on day 22+."""
    assert ramp_target(22, daily_target=15) == 15
    assert ramp_target(40, daily_target=15) == 15
    # Early tiers already below the cap stay at their tier value.
    assert ramp_target(1, daily_target=15) == 5


def test_ramp_schedule_length_and_monotonic() -> None:
    sched = ramp_schedule(daily_target=100, days=35)
    assert len(sched) == 35
    # Non-decreasing across the whole ramp.
    for a, b in zip(sched, sched[1:]):
        assert b >= a
    # Sanity check: day 1 = 5, day 35 = 100.
    assert sched[0] == 5
    assert sched[-1] == 100
