"""Microsoft SNDS (Smart Network Data Services) client.

Pulls per-IP daily reputation data from
``https://postmaster.live.com/snds/data.aspx?key=<access_key>``.
The endpoint returns CSV — no OAuth available, so the user must paste
an access key they've already registered at postmaster.live.com.

The parser is **defensive** by design — Microsoft has historically
re-ordered columns and added new ones without a versioned schema. We:

* Use ``csv.DictReader`` with header-row detection so column-order
  changes don't break field mapping.
* Skip unknown columns silently after logging once per fetch.
* Skip malformed rows (log + continue) rather than abort the batch.
* Never log the access key verbatim — redacted in all log lines.
"""
from __future__ import annotations

import csv
import io
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SNDS_DATA_URL = "https://postmaster.live.com/snds/data.aspx"
DEFAULT_TIMEOUT = 30.0

# Canonical column set we know how to map. Anything else is preserved
# in the row dict for the raw-JSON column but logged once so we notice.
KNOWN_COLUMNS = {
    "IP",
    "Activity-Start",
    "Activity-End",
    "RCPT-Commands",
    "Data-Commands",
    "MessageRecipients",
    "Filter-Result",
    "Complaint-Rate",
    "TrapHits",
    "Sample-Helo",
    "Sample-From",
    "Comments",
}


def _redact_key(key: str) -> str:
    """Return a non-reversible fingerprint suitable for logs."""
    if not key:
        return "<empty>"
    if len(key) <= 8:
        return "***"
    return f"{key[:2]}***{key[-2:]} (len={len(key)})"


class SndsClient:
    """Async httpx-based SNDS CSV puller."""

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

    async def _fetch_raw(self, access_key: str, domain: str | None = None) -> str:
        """Issue the HTTP GET and return the CSV body as text.

        Raises ``httpx.HTTPError`` on transport / non-2xx responses.
        """
        params: dict[str, str] = {"key": access_key}
        # SNDS doesn't take a domain filter on data.aspx — the key already
        # scopes the response. We accept ``domain`` so callers can pass it
        # for logging / future-proofing.
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            resp = await http.get(SNDS_DATA_URL, params=params)
            resp.raise_for_status()
            logger.info(
                "snds.fetch ok key=%s domain=%s bytes=%d",
                _redact_key(access_key), domain, len(resp.text),
            )
            return resp.text

    def _parse_csv(self, body: str) -> list[dict[str, Any]]:
        """Parse SNDS CSV body into a list of row dicts.

        Tolerates:
          * absent header row (SNDS sometimes returns headerless CSV) — we
            fall back to the canonical column order in that case.
          * unknown columns (logged + preserved verbatim in the row dict)
          * malformed rows (logged + skipped)
        """
        if not body or not body.strip():
            return []

        # Detect whether the first row looks like a header. We pick a couple
        # of canonical column names; if at least one shows up in the first
        # line we treat it as a header. Otherwise we synthesize headers
        # from the canonical order.
        first_line = body.splitlines()[0] if body else ""
        looks_like_header = any(
            col.lower() in first_line.lower() for col in ("IP", "Activity-Start", "Filter-Result")
        )

        rows: list[dict[str, Any]] = []
        try:
            if looks_like_header:
                reader = csv.DictReader(io.StringIO(body))
                fieldnames = reader.fieldnames or []
            else:
                # Synthesize a header — preserves backwards-compat with
                # the documented column order.
                fieldnames = [
                    "IP",
                    "Activity-Start",
                    "Activity-End",
                    "RCPT-Commands",
                    "Data-Commands",
                    "MessageRecipients",
                    "Filter-Result",
                    "Complaint-Rate",
                    "TrapHits",
                    "Sample-Helo",
                    "Sample-From",
                    "Comments",
                ]
                reader = csv.DictReader(io.StringIO(body), fieldnames=fieldnames)
        except Exception as exc:  # noqa: BLE001
            logger.warning("snds.parse.failed err=%s", exc)
            return []

        # Log unknown columns once per fetch.
        unknown = [c for c in (fieldnames or []) if c and c not in KNOWN_COLUMNS]
        if unknown:
            logger.info("snds.parse.unknown_columns columns=%s", unknown)

        for i, raw_row in enumerate(reader):
            if raw_row is None:
                continue
            try:
                # Drop empty rows (all values blank).
                if not any((v or "").strip() for v in raw_row.values() if isinstance(v, str)):
                    continue
                # Normalise keys: strip whitespace, keep originals so unknown
                # columns still flow into ``raw``.
                norm: dict[str, Any] = {}
                for k, v in raw_row.items():
                    if k is None:
                        continue
                    norm[k.strip()] = v.strip() if isinstance(v, str) else v
                rows.append(norm)
            except Exception as exc:  # noqa: BLE001
                logger.warning("snds.parse.row_skipped idx=%d err=%s", i, exc)
                continue

        return rows

    async def fetch_csv(self, access_key: str, domain: str | None = None) -> list[dict[str, Any]]:
        """Fetch + parse the CSV for ``access_key``.

        Returns a list of row dicts (empty list on empty body). Network
        failures raise; parse failures degrade to ``[]``.
        """
        body = await self._fetch_raw(access_key, domain=domain)
        return self._parse_csv(body)

    async def validate_key(self, access_key: str) -> bool:
        """Probe the key by attempting one fetch. True on 200 + non-empty CSV."""
        try:
            rows = await self.fetch_csv(access_key)
        except httpx.HTTPError as exc:
            logger.info(
                "snds.validate.http_error key=%s err=%s",
                _redact_key(access_key), exc,
            )
            return False
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "snds.validate.unexpected key=%s err=%s",
                _redact_key(access_key), exc,
            )
            return False
        return bool(rows)


# Module-level singleton for convenience — tests can monkey-patch its
# methods or pass their own ``SndsClient(...)`` instance.
_default_client: SndsClient | None = None


def get_snds_client() -> SndsClient:
    global _default_client
    if _default_client is None:
        _default_client = SndsClient()
    return _default_client


async def fetch_csv(access_key: str, domain: str | None = None) -> list[dict[str, Any]]:
    """Module-level convenience wrapper around the default client."""
    return await get_snds_client().fetch_csv(access_key, domain=domain)


async def validate_key(access_key: str) -> bool:
    """Module-level convenience wrapper around the default client."""
    return await get_snds_client().validate_key(access_key)
