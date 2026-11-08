"""TOTP (RFC 6238 / HOTP RFC 4226) with the stdlib only: HMAC-SHA1, 30 s step,
6 digits, +-1 step window, constant-time compare."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP = 30
DIGITS = 6
WINDOW = 1
ISSUER = 'Shailog Technologies'


def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def _key(secret):
    s = secret.strip().replace(' ', '').upper()
    return base64.b32decode(s + '=' * (-len(s) % 8))


def hotp(secret, counter, digits=DIGITS):
    mac = hmac.new(_key(secret), struct.pack('>Q', counter), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    num = struct.unpack('>I', mac[off:off + 4])[0] & 0x7FFFFFFF
    return str(num % 10 ** digits).zfill(digits)


def current_step(now=None):
    return int((time.time() if now is None else now) // STEP)


def totp(secret, now=None, digits=DIGITS):
    return hotp(secret, current_step(now), digits)


def match_step(secret, code, now=None, last_step=0):
    """Time-step the code belongs to (within +-WINDOW), or None.  A step <=
    last_step is a replay and never matches.  Every candidate is compared so
    timing does not reveal which step was close."""
    code = (code or '').strip().replace(' ', '')
    if len(code) != DIGITS or not code.isdigit():
        return None
    cur = current_step(now)
    found = None
    for step in range(cur - WINDOW, cur + WINDOW + 1):
        if hmac.compare_digest(hotp(secret, step), code) and step > last_step:
            found = step if found is None else max(found, step)
    return found


def otpauth_uri(secret, account):
    label = quote(f'{ISSUER}:{account}')
    return (f'otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}'
            f'&algorithm=SHA1&digits={DIGITS}&period={STEP}')
