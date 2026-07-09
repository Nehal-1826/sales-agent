"""Profile-picture (avatar) storage.

Avatars live as raw bytes in ``users.avatar_image`` with the MIME type in
``users.avatar_mime`` — the same "binary in a column" approach already used
for ``users.totp_secret_encrypted``. There is no object storage in this
deployment; an avatar is small and not a secret, so it is stored unencrypted
and served back through a thin endpoint.

This module owns the validation invariants (allowed MIME types + size cap)
and the persistence so the route handlers stay thin.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.db.models.users import User

# png / jpeg / webp only. Keep this list and MAX_AVATAR_BYTES in sync with the
# client-side check in the Pro Settings avatar uploader.
ALLOWED_AVATAR_MIME: frozenset[str] = frozenset(
    {"image/png", "image/jpeg", "image/webp"}
)
MAX_AVATAR_BYTES: int = 512 * 1024  # 512KB


def validate_avatar(*, content_type: str | None, data: bytes) -> str:
    """Validate an uploaded avatar. Returns the normalised MIME type.

    Raises 415 for a disallowed/missing MIME type, 413 when over the size
    cap, and 400 for an empty body.
    """
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_AVATAR_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Avatar must be a PNG, JPEG, or WebP image",
        )
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Avatar exceeds the 512KB size limit",
        )
    return mime


def set_avatar(user: User, *, data: bytes, mime: str) -> None:
    """Bind validated avatar bytes + mime onto the user row (caller commits)."""
    user.avatar_image = data
    user.avatar_mime = mime


def clear_avatar(user: User) -> None:
    """Clear any stored avatar (caller commits)."""
    user.avatar_image = None
    user.avatar_mime = None


def avatar_version(user: User) -> str:
    """A short cache-buster derived from the stored bytes.

    Lets the frontend append ``?v=<version>`` so a freshly uploaded avatar
    replaces a cached one without a hard reload. Returns ``"0"`` when none.
    """
    if not user.avatar_image:
        return "0"
    # Length + a cheap rolling tail are enough to change on replacement
    # without hashing the whole payload on every profile read.
    tail = user.avatar_image[-16:]
    return f"{len(user.avatar_image)}-{hash(tail) & 0xFFFFFF:06x}"
