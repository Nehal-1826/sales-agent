"""Peer credential blob contract — the seam that silently killed engagement.

Regression coverage for the bug where peer IMAP/SMTP polling never found any
mail in production:

* ``peer_inbox_service._encrypt_creds`` persisted only ``{username, password}``
  — the IMAP/SMTP **host and port were discarded** at create time.
* ``imap_watcher._decrypt_imap_creds`` required ``data["host"]`` → ``KeyError``
  on every real peer. The exception was swallowed by ``list_unread_warmup_*``
  (``except Exception: return []``), so every 3-minute poll returned zero
  messages and *no* open / star / reply / spam-rescue ever dispatched.

The old test suite missed this because it seeded ``imap_creds_encrypted=b"x"``
and mocked every ``imap_watcher`` function — the real decrypt path was never
exercised against a real ``_encrypt_creds`` blob.

These tests exercise the producer → consumer contract directly (no mocks) and
the provider-default fallback that lets already-deployed peers (whose stored
blobs predate the fix and lack a host) keep working without manual re-entry.
"""
from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

from app.db.models.peer_inboxes import PeerProvider
from app.services.crypto import get_fernet_service
from app.services.peer_inbox_service import _encrypt_creds
from app.services.warmup import peer_endpoints
from app.services.warmup.imap_watcher import _decrypt_imap_creds, decrypt_smtp_creds


def _peer(blob: bytes, provider: PeerProvider = PeerProvider.google_ws) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email_address="peer@example.com",
        provider=provider,
        imap_creds_encrypted=blob,
        smtp_creds_encrypted=blob,
    )


def test_imap_blob_round_trips_host_and_port() -> None:
    """A blob written by _encrypt_creds must be readable by _decrypt_imap_creds
    with host + port intact — the contract that was broken."""
    blob = _encrypt_creds(
        "user@example.com", "app-password",
        host="imap.customhost.com", port=1993,
    )
    host, username, password, port = _decrypt_imap_creds(_peer(blob), get_fernet_service())
    assert host == "imap.customhost.com"
    assert username == "user@example.com"
    assert password == "app-password"
    assert port == 1993


def test_smtp_blob_round_trips_host_and_port() -> None:
    blob = _encrypt_creds(
        "user@example.com", "app-password",
        host="smtp.customhost.com", port=2587,
    )
    host, username, password, port = decrypt_smtp_creds(_peer(blob), get_fernet_service())
    assert host == "smtp.customhost.com"
    assert username == "user@example.com"
    assert password == "app-password"
    assert port == 2587


def test_decrypt_imap_falls_back_to_provider_host_for_legacy_blob() -> None:
    """A legacy blob (pre-fix) has no host key. We must fall back to the
    provider's standard IMAP endpoint instead of raising KeyError."""
    fernet = get_fernet_service()
    legacy = fernet.encrypt(json.dumps({"username": "u", "password": "p"}).encode())
    host, username, password, port = _decrypt_imap_creds(
        _peer(legacy, PeerProvider.google_ws), fernet
    )
    assert host == "imap.gmail.com"
    assert port == 993
    assert username == "u"


def test_decrypt_smtp_falls_back_to_provider_host_for_legacy_blob() -> None:
    fernet = get_fernet_service()
    legacy = fernet.encrypt(json.dumps({"username": "u", "password": "p"}).encode())
    host, username, password, port = decrypt_smtp_creds(
        _peer(legacy, PeerProvider.office365), fernet
    )
    assert host == "smtp.office365.com"
    assert port == 587
    assert username == "u"


def test_provider_endpoint_maps_cover_all_providers() -> None:
    """Every PeerProvider must resolve to a concrete IMAP + SMTP endpoint so the
    fallback can never produce a None host."""
    for provider in PeerProvider:
        imap_host, imap_port = peer_endpoints.imap_endpoint(provider)
        smtp_host, smtp_port = peer_endpoints.smtp_endpoint(provider)
        assert imap_host and isinstance(imap_port, int)
        assert smtp_host and isinstance(smtp_port, int)
