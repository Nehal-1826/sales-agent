"""FernetService — envelope encryption for credentials at rest.

Wraps cryptography's ``MultiFernet`` so key rotation is a config change, not a
code change: set ``FERNET_KEY=new_key,old_key`` to decrypt with either and
encrypt with ``new_key``. Ciphertext produced by ``old_key`` remains readable
until it's re-encrypted (write-path) with the new primary key.
"""
from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, MultiFernet

from app.config import Settings, get_settings


class FernetService:
    """Encrypt/decrypt byte payloads using a MultiFernet keyring."""

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise ValueError(
                "FernetService requires at least one key. "
                "Set FERNET_KEY in the environment. "
                "Generate one with: python -c "
                '"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        self._mf = MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])

    def encrypt(self, data: bytes) -> bytes:
        if not isinstance(data, bytes):
            raise TypeError("FernetService.encrypt expects bytes")
        return self._mf.encrypt(data)

    def decrypt(self, token: bytes | str) -> bytes:
        if token is None:
             raise TypeError("FernetService.decrypt received None")
        if isinstance(token, str):
            token = token.encode()
        if not isinstance(token, bytes):
            raise TypeError(f"FernetService.decrypt expects bytes or str, got {type(token)}")
        return self._mf.decrypt(token)

    def rotate(self, token: bytes) -> bytes:
        """Re-encrypt ``token`` under the primary key (for key-rotation sweeps)."""
        return self._mf.rotate(token)


@lru_cache(maxsize=1)
def get_fernet_service(settings: Settings | None = None) -> FernetService:
    s = settings or get_settings()
    return FernetService(s.fernet_keys)
