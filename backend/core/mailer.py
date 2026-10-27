"""
Outbound email — real SMTP when configured in Settings, console delivery
(prints to the Django server log) when not.  Cold emails (approved drafts)
and the daily report both go through send_email_message().

Windows note: some antivirus/proxy software intercepts TLS with its own
certificate, which breaks Python's default verification.  The connection
helper therefore tries: default verify → Windows cert store → unverified
(only yielded when settings.DEBUG is true, loudly logged).
"""

import html as html_lib
import logging
import re
import smtplib
import ssl
import sys
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr, formatdate
from pathlib import Path

from django.conf import settings as django_settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q
from django.utils import timezone

from .models import AppSettings, EmailDraft

log = logging.getLogger(__name__)

SMTP_TIMEOUT = 30

NO_RECIPIENT_ERROR = 'No recipient email — add one before sending.'

# Inline logo attached to every HTML email (referenced as cid:agentic-logo).
LOGO_PATH = Path(__file__).resolve().parent / 'assets' / 'logo.png'
LOGO_CID = '<agentic-logo>'


def _logo_bytes():
    try:
        return LOGO_PATH.read_bytes()
    except OSError:
        return None


def smtp_configured(s=None):
    s = s or AppSettings.load()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def verify_smtp(host, port, user, password, timeout=12):
    """One-click connector probe: real handshake + login, NO message sent.

    Returns '' on success, 'auth' when the server rejected the credentials,
    or 'connect: <reason>' when the server could not be reached (wrong host /
    datacenter, network).  Never raises."""
    for context in _ssl_contexts():
        try:
            if port == 465:  # implicit SSL
                server = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
            else:  # STARTTLS (587 and friends)
                server = smtplib.SMTP(host, port, timeout=timeout)
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
            try:
                server.login(user, password)
                return ''
            except smtplib.SMTPAuthenticationError:
                return 'auth'
            finally:
                try:
                    server.quit()
                except Exception:
                    pass
        except ssl.SSLCertVerificationError:
            continue  # next verification strategy
        except Exception as exc:  # unreachable host / timeout / wrong DC
            return f'connect: {exc.__class__.__name__}'
    return 'connect: tls'


# Zoho datacenters in probe order — the connector figures out the account's
# home so the operator never has to know it.
ZOHO_SMTP_HOSTS = [('smtp.zoho.in', 587), ('smtp.zoho.com', 587), ('smtp.zoho.eu', 587)]
GMAIL_SMTP_HOST = ('smtp.gmail.com', 587)


def connect_mailbox(provider, user, password, host='', port=587):
    """Shared one-click connect used by the Settings endpoint AND the chat
    onboarding wizard.  Probes the provider's servers with verify_smtp and
    saves the first that authenticates as the live SMTP setup.

    Returns the response dict: {ok, host?, port?, provider?, message}."""
    if not user or not password:
        return {'ok': False,
                'message': 'Enter the mailbox address and its password / app password.'}
    if provider == 'zoho':
        hosts = ZOHO_SMTP_HOSTS
    elif provider == 'gmail':
        hosts = [GMAIL_SMTP_HOST]
    else:  # custom — caller-supplied host/port
        if not host:
            return {'ok': False, 'message': 'Custom provider needs a host.'}
        hosts = [(host, port or 587)]

    tried, auth_failures = [], 0
    for host, port in hosts:
        tried.append(host)
        result = verify_smtp(host, port, user, password)
        if result == '':
            settings = AppSettings.load()
            settings.smtp_host = host
            settings.smtp_port = port
            settings.smtp_user = user
            settings.smtp_password = password
            if not settings.from_email:
                settings.from_email = user
            settings.save(update_fields=['smtp_host', 'smtp_port', 'smtp_user',
                                         'smtp_password', 'from_email', 'updated_at'])
            return {'ok': True, 'host': host, 'port': port, 'provider': provider,
                    'message': f'Connected — login verified against {host}.'}
        if result == 'auth':
            auth_failures += 1

    if auth_failures:
        hint = ('Zoho rejected the credentials. With 2FA on you must use an App Password '
                '(accounts.zoho.com → Security → App Passwords), and IMAP/SMTP access must be '
                'enabled in Zoho Mail settings.') if provider == 'zoho' else (
               'The server rejected the credentials — check the address and password '
               '(Gmail needs an App Password, not your login).')
        return {'ok': False, 'message': hint}
    return {'ok': False,
            'message': f'Could not reach {", ".join(tried)} — check the network or host.'}


def _ssl_contexts():
    """Verification strategies, tried in order."""
    yield ssl.create_default_context()
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.load_default_certs()  # includes the Windows certificate store
        yield ctx
    except Exception:
        pass
    if django_settings.DEBUG:  # never skip certificate checks in production
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


def send_email_message(subject, body, recipients, s=None, html=None):
    """Send one email via the configured SMTP — plain text, plus an optional
    branded HTML part (logo header) with the logo attached inline. True on success."""
    s = s or AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'outreach@shailog.com'
    sender_name = s.company_name or 'Agentic AI'
    msg = EmailMessage()
    msg['From'] = formataddr((sender_name, from_email))
    msg['To'] = ', '.join(recipients)
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype='html')
        logo = _logo_bytes()
        if logo:
            msg.get_payload()[1].add_related(logo, 'image', 'png', cid=LOGO_CID)
    with _open_smtp(s) as server:
        server.send_message(msg)
    return True


# ------------------------------------------------------------------
# Branded HTML wrappers — inline styles only (email clients strip CSS)
# ------------------------------------------------------------------

def branded_email_html(content_html, s=None):
    """Logo header bar + content + footer, ready for send_email_message(html=…)."""
    s = s or AppSettings.load()
    name = s.company_name or 'Agentic AI'
    logo = _logo_bytes()
    if logo:
        brand = (
            f'<img src="cid:{LOGO_CID[1:-1]}" alt="{html_lib.escape(name)}" width="120" height="48" '
            'style="display:block;width:120px;height:48px;border:0">'
        )
    else:  # no logo file — fall back to a text wordmark so the header still brands
        brand = (f'<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;'
                 f'font-weight:bold;color:#ffffff;letter-spacing:2px">{html_lib.escape(name).upper()}</span>')
    company = html_lib.escape(s.company_name) if s.company_name else 'Shailog Technologies'
    return (
        '<div style="margin:0;padding:24px 8px;background:#f3f4f6">'
        '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">'
        f'<div style="background:#0b0f19;padding:18px 28px">{brand}</div>'
        '<div style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        f'line-height:1.65;color:#1f2937">{content_html}</div>'
        '<div style="padding:14px 28px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;'
        f'font-size:12px;color:#6b7280">A {company} product · autonomous sales pipeline</div>'
        '</div></div>'
    )


def text_to_email_html(text):
    """Plain text (cold-email body, report) as an HTML block that keeps line breaks."""
    return f'<div style="white-space:pre-wrap">{html_lib.escape(text)}</div>'


# ------------------------------------------------------------------
# Designer cold-email layout — parses the plain draft into paragraphs,
# finding cards and a signature, rendered with warm editorial styling
# (orange accent matches the Shailog logo).
# ------------------------------------------------------------------

ACCENT = '#e8720c'

_SIGN_OFF = re.compile(
    r'^(best|regards|kind regards|warm regards|cheers|thanks|thank you|warmly|sincerely)[,.!?]?$', re.I)


def _esc(t):
    return html_lib.escape(t)


def _body_blocks(text):
    """Split a plain email body into ('para'|'list'|'lead', content) blocks."""
    blocks = []
    for raw in re.split(r'\n\s*\n', text.strip()):
        lines = [l.strip() for l in raw.split('\n') if l.strip()]
        if not lines:
            continue
        if all(re.match(r'^[•\-\*]\s+', l) for l in lines):
            blocks.append(('list', [re.sub(r'^[•\-\*]\s+', '', l) for l in lines]))
        elif len(lines) == 1 and lines[0].endswith(':'):
            blocks.append(('lead', lines[0]))
        else:
            blocks.append(('para', lines))
    return blocks


def designed_email_html(text, s=None):
    """Designer layout for one cold-email body: serif paragraphs, accent
    finding-cards for • lines, and a signature block with a CTA button.
    Drops into the same branded header/footer as send_email_message()."""
    s = s or AppSettings.load()
    lines_all = [l.strip() for l in (text or '').split('\n') if l.strip()]

    sign_idx = next((i for i, l in enumerate(lines_all) if _SIGN_OFF.match(l)), None)
    body_text = '\n'.join(lines_all[:sign_idx]) if sign_idx is not None else '\n'.join(lines_all)
    sign_lines = lines_all[sign_idx:] if sign_idx is not None else []

    parts = []
    for kind, content in _body_blocks(body_text):
        if kind == 'list':
            for item in content:
                parts.append(
                    f'<div style="background:#faf8f4;border-left:3px solid {ACCENT};'
                    f'border-radius:8px;padding:11px 14px;margin:0 0 8px;'
                    f'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;'
                    f'color:#3d3a35">{_esc(item)}</div>')
        elif kind == 'lead':
            parts.append(
                f'<p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;'
                f'font-size:13.5px;font-weight:700;color:#1c1917">{_esc(content[:-1])}</p>')
        else:
            parts.append(
                '<p style="margin:0 0 14px;font-family:Georgia,\'Times New Roman\',serif;'
                f'font-size:15.5px;line-height:1.7;color:#2d2a26">{_esc(" ".join(content))}</p>')

    if sign_lines:
        site = next((l for l in sign_lines[1:]
                     if re.match(r'^(https?://|www\.)|[a-z0-9.-]+\.[a-z]{2,}', l, re.I)), '')
        site_clean = re.sub(r'^https?://', '', site).rstrip('/')
        site_href = site if site.startswith('http') else f'https://{site}'
        name = next((l for l in sign_lines[1:] if l != site), s.company_name or 'Our team')
        button = (
            f'<a href="{_esc(site_href)}" style="display:inline-block;margin-top:10px;'
            f'background:{ACCENT};color:#ffffff;font-family:Arial,Helvetica,sans-serif;'
            f'font-size:13px;font-weight:600;text-decoration:none;padding:11px 20px;'
            f'border-radius:8px">See our work &#8594;</a>' if site_clean else '')
        parts.append(
            '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #ece5db">'
            f'<p style="margin:0 0 8px;font-family:Georgia,serif;font-size:14px;color:#8a8578">'
            f'{_esc(sign_lines[0].rstrip(",.!"))},</p>'
            f'<div style="font-family:Georgia,serif;font-weight:700;font-size:17px;'
            f'color:#14110e">{_esc(name)}</div>'
            f'{button}</div>')

    return ''.join(parts)


def _log_console_delivery(draft, from_email):
    """No SMTP yet: print the full email to the server console so the
    workflow is still end-to-end verifiable."""
    line = '-' * 62
    text = (f"\n{line}\n[COLD EMAIL -- console delivery, SMTP not configured]\n{line}\n"
            f"From:    {from_email}\nTo:      {draft.to_email or '(no address found)'}\n"
            f"Subject: {draft.subject}\n\n{draft.body}\n{line}\n")
    # Windows consoles are cp1252 — a bare print() of "→" would raise and fail the send
    enc = getattr(sys.stdout, 'encoding', None) or 'utf-8'
    print(text.encode(enc, errors='replace').decode(enc))
    log.info('Console-delivered cold email to %s (%s)', draft.to_email or 'n/a', draft.company)


def valid_recipient(email):
    """True only for a syntactically valid address — never guess one."""
    email = (email or '').strip()
    if not email:
        return False
    try:
        validate_email(email)
    except ValidationError:
        return False
    return True


# An APPROVED draft untouched this long lost its sender (process died between
# the claim and send_draft writing a result) and may be claimed again.
STUCK_AFTER = timedelta(minutes=15)


def claim_draft_for_send(draft_id, from_statuses=(EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED)):
    """Atomically move a draft to APPROVED.  Returns the draft, or None when
    another request (double-click, chat 'approve all') already claimed it —
    the conditional UPDATE is what makes double sends impossible.  An APPROVED
    draft older than STUCK_AFTER (crashed sender) is claimable too; a fresh one
    is still actively sending and never is."""
    stuck = Q(status=EmailDraft.Statuses.APPROVED,
              updated_at__lt=timezone.now() - STUCK_AFTER)
    claimed = (EmailDraft.objects.filter(Q(status__in=list(from_statuses)) | stuck, pk=draft_id)
               .update(status=EmailDraft.Statuses.APPROVED, updated_at=timezone.now()))
    return EmailDraft.objects.filter(pk=draft_id).first() if claimed else None


def send_draft(draft):
    """Send one EmailDraft. Updates status/sent_via/sent_at/error. Returns the draft.

    Never leaves the draft stuck in APPROVED: any failure on the send path —
    settings lookup, console print, SMTP — ends as FAILED with the error text."""
    # a pasted address often carries stray whitespace — normalize before validating
    draft.to_email = (draft.to_email or '').strip()

    if not valid_recipient(draft.to_email):
        # never invent contact@<domain> — a guessed address reaches strangers
        draft.status = EmailDraft.Statuses.FAILED
        draft.error = NO_RECIPIENT_ERROR
        draft.save(update_fields=['to_email', 'status', 'error', 'updated_at'])
        return draft

    try:
        s = AppSettings.load()
        from_email = s.from_email or s.smtp_user or 'outreach@shailog.com'
        if not smtp_configured(s):
            _log_console_delivery(draft, from_email)
            draft.status = EmailDraft.Statuses.SENT
            draft.sent_via = EmailDraft.Via.CONSOLE
            draft.sent_at = timezone.now()
            draft.error = ''
        else:
            send_email_message(
                draft.subject, draft.body, [draft.to_email], s,
                html=branded_email_html(designed_email_html(draft.body, s), s),
            )
            draft.status = EmailDraft.Statuses.SENT
            draft.sent_via = EmailDraft.Via.SMTP
            draft.sent_at = timezone.now()
            draft.error = ''
            log.info('SMTP cold email sent to %s (%s)', draft.to_email, draft.company)
    except Exception as exc:
        draft.status = EmailDraft.Statuses.FAILED
        draft.error = str(exc)[:500] or exc.__class__.__name__
        log.warning('Send failed for %s: %s', draft.to_email, exc)

    draft.save(update_fields=['to_email', 'status', 'sent_via', 'sent_at', 'error', 'updated_at'])
    return draft
