"""Standard IMAP / SMTP endpoints per peer provider.

Peer inboxes belong to one of three managed providers. Their mail-server
hostnames are well-known and stable, so we keep a static map here rather than
forcing operators to type them in for every peer.

This map is the **fallback** used when a peer's encrypted credential blob does
not already carry an explicit ``host`` / ``port`` — which is the case for any
peer created before the credential blob learned to persist host/port. New peers
store the exact host/port the operator entered (so non-standard relays still
work); legacy peers transparently resolve to these defaults instead of failing
the IMAP/SMTP connection with a ``KeyError: 'host'``.

Ports follow the convention ``smtp_sender`` / ``imap_watcher`` expect:
* IMAP over implicit TLS → 993
* SMTP STARTTLS → 587, SMTP implicit TLS → 465
  (``smtp_sender`` picks ``use_tls`` for 465 and ``start_tls`` for 587).
"""
from __future__ import annotations

from app.db.models.peer_inboxes import PeerProvider

# (host, port) keyed by provider value string so callers can pass either the
# enum or its ``.value``.
_IMAP: dict[str, tuple[str, int]] = {
    PeerProvider.google_ws.value: ("imap.gmail.com", 993),
    PeerProvider.office365.value: ("outlook.office365.com", 993),
    PeerProvider.yahoo.value: ("imap.mail.yahoo.com", 993),
}

_SMTP: dict[str, tuple[str, int]] = {
    PeerProvider.google_ws.value: ("smtp.gmail.com", 587),
    PeerProvider.office365.value: ("smtp.office365.com", 587),
    PeerProvider.yahoo.value: ("smtp.mail.yahoo.com", 465),
}

# Last-resort default if a peer somehow carries an unknown provider — Gmail's
# endpoints are the safest generic guess and keep the pipeline from crashing.
_DEFAULT_IMAP = ("imap.gmail.com", 993)
_DEFAULT_SMTP = ("smtp.gmail.com", 587)


def _provider_key(provider: object) -> str:
    return provider.value if hasattr(provider, "value") else str(provider)


def imap_endpoint(provider: object) -> tuple[str, int]:
    """Return ``(host, port)`` for the provider's IMAP server."""
    return _IMAP.get(_provider_key(provider), _DEFAULT_IMAP)


def smtp_endpoint(provider: object) -> tuple[str, int]:
    """Return ``(host, port)`` for the provider's SMTP server."""
    return _SMTP.get(_provider_key(provider), _DEFAULT_SMTP)
