"""Mailbox test-connection probe (Settings → Mailboxes wizard).

Real IMAP + SMTP verification with stdlib imaplib / smtplib — the same
handshake the outbox uses at send time, minus sending a message.  Runs
synchronously inside the API view (short, bounded timeouts — never blocks a
worker).  No network in tests: callers mock core.mailbox_probe.imaplib /
core.mailbox_probe.smtplib.

Safety contract:
  * socket timeout <= 8 s per leg (PROBE_TIMEOUT);
  * TLS first, plain fallback allowed but FLAGGED in the detail string;
  * the password NEVER appears in a result detail or a log line — server
    exception text is reduced to the class name (a login error's message can
    quote the credentials back).
"""

import imaplib
import logging
import smtplib
import socket
import ssl

log = logging.getLogger(__name__)

PROBE_TIMEOUT = 8  # seconds per leg — hard ceiling for the wizard probe

AUTH_HINT = ('Login rejected — check the address and its app password '
             '(Gmail/Zoho/Outlook all need an app password, not the login one).')
UNREACHABLE = 'Could not reach {host}:{port} — check the server address and network. ({exc})'


def _timeout_detail(host, port, timeout):
    return f'Timed out after {timeout}s talking to {host}:{port} — host, port or network is wrong.'


def _login_error(prefix, exc):
    """Error detail that can never quote the password back."""
    return f'{prefix} ({exc.__class__.__name__})'


def probe_imap(host, port, username, password, timeout=PROBE_TIMEOUT):
    """One leg: IMAP login.  TLS (IMAP4_SSL) first, plain IMAP4 as a flagged
    fallback.  Returns {ok, detail}; never raises, never leaks the password."""
    host = (host or '').strip()
    if not host:
        return {'ok': False, 'detail': 'No IMAP host given.'}
    port = int(port or 993)
    from .mailer import _ssl_contexts  # Windows cert-store / DEBUG fallbacks

    conn, tls = None, False
    for context in _ssl_contexts():
        try:
            conn = imaplib.IMAP4_SSL(host, port, ssl_context=context, timeout=timeout)
            tls = True
            break
        except ssl.SSLCertVerificationError:
            continue
        except (socket.timeout, TimeoutError):
            return {'ok': False, 'detail': _timeout_detail(host, port, timeout)}
        except Exception as exc:
            log.info('IMAP probe: TLS to %s:%s failed (%s) — trying plain',
                     host, port, exc.__class__.__name__)
            break
    if conn is None:
        try:
            conn = imaplib.IMAP4(host, port, timeout=timeout)
        except (socket.timeout, TimeoutError):
            return {'ok': False, 'detail': _timeout_detail(host, port, timeout)}
        except Exception as exc:
            return {'ok': False, 'detail': UNREACHABLE.format(host=host, port=port,
                                                              exc=exc.__class__.__name__)}
    try:
        conn.login(username, password)
    except imaplib.IMAP4.error:
        return {'ok': False, 'detail': AUTH_HINT}
    except Exception as exc:
        return {'ok': False, 'detail': _login_error('IMAP login error', exc)}
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    if tls:
        return {'ok': True, 'detail': f'IMAP login verified over TLS ({host}:{port}).'}
    return {'ok': True,
            'detail': f'IMAP login verified, but the connection is NOT encrypted '
                      f'({host}:{port} offered no TLS) — use port 993 for TLS.'}


def probe_smtp(host, port, username, password, timeout=PROBE_TIMEOUT):
    """One leg: SMTP EHLO (+STARTTLS when offered) + login.  No message is
    sent.  Returns {ok, detail}; never raises, never leaks the password."""
    host = (host or '').strip()
    if not host:
        return {'ok': False, 'detail': 'No SMTP host given.'}
    port = int(port or 587)
    from .mailer import _ssl_contexts

    try:
        if port == 465:  # implicit TLS — same as mailer._open_smtp
            server = None
            for context in _ssl_contexts():
                try:
                    server = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
                    break
                except ssl.SSLCertVerificationError:
                    continue
            if server is None:
                return {'ok': False, 'detail': f'Could not establish TLS to {host}:{port}.'}
            tls = True
        else:
            server = smtplib.SMTP(host, port, timeout=timeout)
            tls = False
        try:
            server.ehlo()
            if port != 465 and getattr(server, 'has_extn', lambda _n: False)('starttls'):
                for context in _ssl_contexts():
                    try:
                        server.starttls(context=context)
                        break
                    except ssl.SSLCertVerificationError:
                        continue
                server.ehlo()
                tls = True
            server.login(username, password)
        finally:
            try:
                server.quit()
            except Exception:
                pass
        if tls:
            return {'ok': True, 'detail': f'SMTP login verified over TLS ({host}:{port}).'}
        return {'ok': True,
                'detail': f'SMTP login verified, but the connection is NOT encrypted '
                          f'({host}:{port} offered no STARTTLS) — prefer 587 with TLS or 465.'}
    except smtplib.SMTPAuthenticationError:
        return {'ok': False, 'detail': AUTH_HINT}
    except smtplib.SMTPNotSupportedError:
        return {'ok': False, 'detail': f'{host}:{port} does not accept this login method.'}
    except (socket.timeout, TimeoutError):
        return {'ok': False, 'detail': _timeout_detail(host, port, timeout)}
    except Exception as exc:
        return {'ok': False, 'detail': UNREACHABLE.format(host=host, port=port,
                                                          exc=exc.__class__.__name__)}


def probe_mailbox(imap_host, imap_port, smtp_host, smtp_port, username, password,
                  timeout=PROBE_TIMEOUT):
    """Both legs for the wizard's Test Connection button.
    {imap: {ok, detail}, smtp: {ok, detail}} — the password is never echoed."""
    return {
        'imap': probe_imap(imap_host, imap_port, username, password, timeout=timeout),
        'smtp': probe_smtp(smtp_host, smtp_port, username, password, timeout=timeout),
    }
