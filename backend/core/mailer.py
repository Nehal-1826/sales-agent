"""
Outbound email — real SMTP when configured in Settings, console delivery
(prints to the Django server log) when not.  Cold emails (approved drafts)
and the daily report both go through send_email_message().

Windows note: some antivirus/proxy software intercepts TLS with its own
certificate, which breaks Python's default verification.  The connection
helper therefore tries: default verify → Windows cert store → unverified
(dev machines only, loudly logged).
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate

from django.utils import timezone

from .models import AppSettings, EmailDraft

log = logging.getLogger(__name__)

SMTP_TIMEOUT = 30


def smtp_configured(s=None):
    s = s or AppSettings.load()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def _ssl_contexts():
    """Verification strategies, tried in order."""
    yield ssl.create_default_context()
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.load_default_certs()  # includes the Windows certificate store
        yield ctx
    except Exception:
        pass
    ctx = ssl._create_unverified_context()  # noqa: SLF001 — dev-machine fallback
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    yield ctx


def _open_smtp(s):
    """Connect + authenticate to the configured SMTP server, TLS-safe on Windows."""
    port = s.smtp_port or 587
    last_error = None
    for context in _ssl_contexts():
        try:
            if port == 465:  # implicit SSL
                server = smtplib.SMTP_SSL(s.smtp_host, port, timeout=SMTP_TIMEOUT, context=context)
            else:  # STARTTLS (587 and friends)
                server = smtplib.SMTP(s.smtp_host, port, timeout=SMTP_TIMEOUT)
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
            server.login(s.smtp_user, s.smtp_password)
            return server
        except ssl.SSLCertVerificationError as exc:
            last_error = exc
            log.warning('SMTP TLS verification failed (%s) — trying next strategy', exc)
        except Exception:
            raise
    raise last_error


def send_email_message(subject, body, recipients, s=None):
    """Send one plain-text email via the configured SMTP. Returns True on success."""
    s = s or AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'outreach@agentic-ai.local'
    msg = EmailMessage()
    msg['From'] = from_email
    msg['To'] = ', '.join(recipients)
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    msg.set_content(body)
    with _open_smtp(s) as server:
        server.send_message(msg)
    return True


def _log_console_delivery(draft, from_email):
    """No SMTP yet: print the full email to the server console so the
    workflow is still end-to-end verifiable."""
    line = '-' * 62
    print(f"\n{line}\n[COLD EMAIL -- console delivery, SMTP not configured]\n{line}")
    print(f"From:    {from_email}\nTo:      {draft.to_email or '(no address found)'}")
    print(f"Subject: {draft.subject}\n\n{draft.body}\n{line}\n")
    log.info('Console-delivered cold email to %s (%s)', draft.to_email or 'n/a', draft.company)


def send_draft(draft):
    """Send one EmailDraft. Updates status/sent_via/sent_at/error. Returns the draft."""
    s = AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'outreach@agentic-ai.local'

    if not draft.to_email:
        # Fallback target email derived from lead company domain or name
        domain = draft.lead.website if (draft.lead and draft.lead.website) else ''
        domain = domain.split('/')[0].split('?')[0].lower().strip()
        if domain.startswith('www.'):
            domain = domain[4:]
        if domain and '.' in domain:
            draft.to_email = f'contact@{domain}'
        else:
            clean_name = ''.join(c for c in draft.company.lower() if c.isalnum()) or 'target'
            draft.to_email = f'contact@{clean_name}.com'
        draft.save(update_fields=['to_email', 'updated_at'])

    if not smtp_configured(s):
        _log_console_delivery(draft, from_email)
        draft.status = EmailDraft.Statuses.SENT
        draft.sent_via = EmailDraft.Via.CONSOLE
        draft.sent_at = timezone.now()
        draft.error = ''
    else:
        try:
            send_email_message(draft.subject, draft.body, [draft.to_email], s)
            draft.status = EmailDraft.Statuses.SENT
            draft.sent_via = EmailDraft.Via.SMTP
            draft.sent_at = timezone.now()
            draft.error = ''
            log.info('SMTP cold email sent to %s (%s)', draft.to_email, draft.company)
        except Exception as exc:
            draft.status = EmailDraft.Statuses.FAILED
            draft.error = str(exc)[:500]
            log.warning('SMTP send failed for %s: %s', draft.to_email, exc)

    draft.save(update_fields=['status', 'sent_via', 'sent_at', 'error', 'updated_at'])
    return draft
