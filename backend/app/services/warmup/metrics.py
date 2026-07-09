"""Warmth-score formula + rollup helpers.

The score blends five signals (spec §2 / architecture.html inbound-cycle
section):
    - inbox placement %     (authoritative but only available via seed tests)
    - reply rate            (highest-trust engagement)
    - open rate             (weaker, but cheap to observe)
    - spam-rescue rate      (peer moved msg out of Junk — strongest ESP signal)
    - bounce rate           (penalty only)

Weights chosen to keep a mailbox with *no placement data yet* at ~40 (the
default "unknown" baseline of 100% placement weighted at 0.40) plus whatever
engagement it's generating. Caller is responsible for clamping inputs to
non-negative integers.
"""
from __future__ import annotations


def warmth_score(
    emails_sent: int,
    opens: int,
    replies: int,
    spam_rescues: int,
    bounces: int,
    placement_pct: float | None,
) -> float:
    """Return a 0–100 warmth score for a mailbox's recent activity window."""
    if emails_sent == 0:
        return 0.0

    # Default placement to "unknown = assumed 100%" when no seed test has run;
    # Wave 4 will replace this with live placement_tests data.
    base = placement_pct if placement_pct is not None else 100.0

    open_rate = opens / emails_sent
    reply_rate = replies / emails_sent
    rescue_rate = spam_rescues / emails_sent
    bounce_rate = bounces / emails_sent

    score = (
        0.40 * base
        + 0.30 * (reply_rate * 100)
        + 0.15 * (open_rate * 100)
        + 0.15 * (rescue_rate * 100)
        - 30.0 * bounce_rate
    )
    return max(0.0, min(100.0, score))
