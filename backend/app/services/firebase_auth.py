"""Firebase ID token verification using Google's public X.509 certs.

Lightweight alternative to firebase-admin SDK — no service-account JSON
needed. Firebase ID tokens are RS256 JWTs signed by Google with rotating
keys; we fetch the cert bundle, cache it for an hour, and verify the
signature + claims with PyJWT.
"""
from __future__ import annotations

import logging
import time

import httpx
import jwt
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.x509 import load_pem_x509_certificate
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)
_CERT_TTL_SEC = 3600

_certs_cache: dict[str, str] = {}
_certs_cached_at: float = 0.0
# Parsed public keys keyed by kid. Parsing an X.509 cert + extracting the
# PEM-encoded public key takes ~5-15ms via the cryptography library; doing
# it on every Firebase login adds up. Cleared whenever _certs_cache is
# refreshed (kid rotation or TTL expiry) so we never serve a stale key.
_public_keys_cache: dict[str, bytes] = {}


async def _fetch_certs(force: bool = False) -> dict[str, str]:
    """Return the current Google public-cert bundle, fetching if cold or stale.

    Pass ``force=True`` after a kid-miss so an in-flight key rotation
    doesn't permanently 401 every Firebase login until the 1 h TTL ages
    out the stale cache.
    """
    global _certs_cache, _certs_cached_at
    if not force and _certs_cache and (time.monotonic() - _certs_cached_at) < _CERT_TTL_SEC:
        return _certs_cache
    async with httpx.AsyncClient(timeout=10.0) as http:
        r = await http.get(_CERTS_URL)
        r.raise_for_status()
        _certs_cache = r.json()
        _certs_cached_at = time.monotonic()
        # Cert bundle changed — drop the parsed-key cache so we re-extract
        # on next verify against the fresh PEMs.
        _public_keys_cache.clear()
    return _certs_cache


async def verify_firebase_id_token(token: str, project_id: str) -> dict:
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase project ID is not configured",
        )
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed ID token: {exc}",
        ) from exc

    kid = unverified_header.get("kid")
    certs = await _fetch_certs()
    pem = certs.get(kid) if kid else None
    if pem is None:
        # Kid miss usually means Google rotated keys since our last cache
        # fetch. Refresh once and retry — without this the cache stays
        # stale for a full hour and every Firebase login 401s.
        logger.warning(
            "firebase_auth.kid_miss kid=%s known_kids=%s — refreshing cert cache",
            kid, list(certs.keys()),
        )
        certs = await _fetch_certs(force=True)
        pem = certs.get(kid) if kid else None
        if pem is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ID token signing key not recognized (post cert refresh)",
            )

    # Google returns X.509 certs (PEM "BEGIN CERTIFICATE"), not raw public
    # keys. PyJWT can't parse a cert as a key, so extract the public key
    # from the cert first — without this every decode fails with
    # "Could not parse the provided public key" → 401.
    #
    # Cache the parsed public-key PEM per-kid: cert parsing + public-key
    # extraction is the dominant CPU cost on the verify path (~5-15ms via
    # `cryptography`). For a hot login flow we'd otherwise re-parse on
    # every request. Cache is invalidated whenever the cert bundle rotates
    # (see _fetch_certs).
    public_key_pem = _public_keys_cache.get(kid) if kid else None
    if public_key_pem is None:
        try:
            cert = load_pem_x509_certificate(pem.encode("utf-8") if isinstance(pem, str) else pem)
            public_key_pem = cert.public_key().public_bytes(
                encoding=Encoding.PEM,
                format=PublicFormat.SubjectPublicKeyInfo,
            )
        except Exception as exc:
            logger.exception("firebase_auth.cert_parse_failed kid=%s", kid)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not parse Firebase signing certificate",
            ) from exc
        if kid:
            _public_keys_cache[kid] = public_key_pem

    try:
        decoded = jwt.decode(
            token,
            key=public_key_pem,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        # Log enough context to debug from server logs without leaking the
        # full token. Common reasons: expired (exp claim past now), wrong
        # audience (FIREBASE_PROJECT_ID mismatch), wrong issuer (token
        # came from a different Firebase project).
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            logger.warning(
                "firebase_auth.invalid_token reason=%s aud=%s iss=%s exp=%s expected_aud=%s",
                exc, unverified.get("aud"), unverified.get("iss"),
                unverified.get("exp"), project_id,
            )
        except Exception:  # noqa: BLE001
            logger.warning("firebase_auth.invalid_token reason=%s (could not decode)", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid ID token: {exc}",
        ) from exc

    if not decoded.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID token missing subject",
        )
    return decoded
