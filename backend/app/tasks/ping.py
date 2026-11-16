"""Trivial smoke task so the worker has something to register at boot."""
from __future__ import annotations

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.ping.ping")
def ping() -> str:
    return "pong"
