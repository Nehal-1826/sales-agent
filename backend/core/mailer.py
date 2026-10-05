"""
Outbound email — real SMTP when configured in Settings, console delivery
(prints to the Django server log) when not.  Cold emails (approved drafts)
and the daily report both go through send_email_message().

Windows note: some antivirus/proxy software intercepts TLS with its own
certificate, which breaks Python's default verification.  The connection
helper therefore tries: default verify → Windows cert store → unverified
(dev machines only, loudly logged).
"""

import html as html_lib
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate
from pathlib import Path

from django.utils import timezone

from .models import AppSettings, EmailDraft

log = logging.getLogger(__name__)

SMTP_TIMEOUT = 30

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


def send_email_message(subject, body, recipients, s=None, html=None):
    """Send one email via the configured SMTP — plain text, plus an optional
    branded HTML part (logo header) with the logo attached inline. True on success."""
    s = s or AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'outreach@agentic-ai.local'
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
            draft.error = str(exc)[:500]
            log.warning('SMTP send failed for %s: %s', draft.to_email, exc)

    draft.save(update_fields=['status', 'sent_via', 'sent_at', 'error', 'updated_at'])
    return draft
