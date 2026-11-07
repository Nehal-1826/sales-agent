"""Reply + bounce ingestion — reads each active Mailbox over IMAP.

Read-only by design: messages are fetched with BODY.PEEK[] (never marked
read), and nothing is ever deleted, moved or flagged.  A per-mailbox UID
high-water mark (Mailbox.imap_last_uid) means each message is processed once.

Each inbound message is matched to an EmailDraft we sent (In-Reply-To /
References contain our Message-ID; fallback: the sender is the address we
emailed).  Mail unrelated to our outreach is ignored.  Then:

- delivery failure (DSN) — hard 5.x.x: draft.bounced_at, Suppression(BOUNCE),
  lead.analysis['email_bounced'], outbox.check_bounce_pause(); soft 4.x.x:
  noted on the draft only.
- auto-reply / out-of-office — stored as a handled Reply, not a human answer.
- human reply — a Reply row, classified (LLM when available, else keywords).
  unsubscribe → Suppression + every queued/draft email to them rejected;
  interested / question → a suggested answer the HUMAN must approve
  (approve_suggestion → threaded EmailDraft → outbox).  Never auto-sent.
"""
import email
import imaplib
import json
import logging
import re
import ssl
from datetime import timedelta, timezone as dt_timezone
from email import policy
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

from django.db import transaction
from django.utils import timezone

from .models import AppSettings, EmailDraft, Lead, Mailbox, Potential, Reply, Suppression

log = logging.getLogger(__name__)

IMAP_TIMEOUT = 30
POLL_CAP = 50              # messages processed per mailbox per poll
FIRST_POLL_LOOKBACK = 200  # first poll only looks at the newest N UIDs
POLL_EVERY = 180           # seconds (run_worker inbox thread)

_Q = EmailDraft.Statuses
_C = Reply.Classes


# ------------------------------------------------------------------
# Connection
# ------------------------------------------------------------------

def imap_host_for(mailbox):
    """Explicit imap_host, else derived from the SMTP host
    (smtp.zoho.in → imap.zoho.in, smtp.gmail.com → imap.gmail.com)."""
    if mailbox.imap_host:
        return mailbox.imap_host.strip()
    host = (mailbox.smtp_host or '').strip().lower()
    if not host:
        return ''
    if host.startswith('smtp.'):
        return 'imap.' + host[5:]
    if host.startswith('smtppro.'):  # Zoho paid tier
        return 'imappro.' + host[8:]
    return host


def imap_credentials(mailbox):
    return (mailbox.imap_user or mailbox.smtp_user,
            mailbox.imap_password or mailbox.smtp_password)


def imap_configured(mailbox):
    user, password = imap_credentials(mailbox)
    return bool(imap_host_for(mailbox) and user and password)


def open_imap(mailbox):
    """Authenticated IMAP4_SSL session, same TLS fallback strategy as SMTP."""
    from .mailer import _ssl_contexts
    host, port = imap_host_for(mailbox), mailbox.imap_port or 993
    user, password = imap_credentials(mailbox)
    last_error = None
    for context in _ssl_contexts():
        try:
            conn = imaplib.IMAP4_SSL(host, port, ssl_context=context, timeout=IMAP_TIMEOUT)
        except ssl.SSLCertVerificationError as exc:
            last_error = exc
            continue
        conn.login(user, password)
        return conn
    raise last_error or OSError('IMAP TLS failed')


# ------------------------------------------------------------------
# Parsing
# ------------------------------------------------------------------

_MSGID = re.compile(r'<[^<>\s]+>')


def message_ids(value):
    """All <id@host> tokens in a header value (In-Reply-To / References)."""
    return _MSGID.findall(str(value or ''))


def parse_message(raw):
    """bytes → EmailMessage, or None when it can't be parsed at all."""
    try:
        return email.message_from_bytes(raw, policy=policy.default)
    except Exception as exc:  # malformed mail must never stop the poll
        log.warning('Unparseable inbound message: %s', exc)
        return None


def _header(msg, name):
    try:
        return str(msg.get(name, '') or '')
    except Exception:  # a broken encoded-word header
        return ''


def sender_address(msg):
    return parseaddr(_header(msg, 'From'))[1].strip().lower()


def plain_body(msg):
    """Best-effort text of the message (text/plain, else stripped HTML)."""
    try:
        part = msg.get_body(preferencelist=('plain', 'html'))
        if part is None:
            return ''
        text = part.get_content()
        if part.get_content_type() == 'text/html':
            text = re.sub(r'(?is)<(script|style).*?</\1>', ' ', text)
            text = re.sub(r'(?i)<br\s*/?>|</p>|</div>', '\n', text)
            text = re.sub(r'<[^>]+>', ' ', text)
        return text if isinstance(text, str) else ''
    except Exception:
        try:
            payload = msg.get_payload(decode=True) or b''
            return payload.decode('utf-8', errors='replace')
        except Exception:
            return ''


_QUOTE_START = re.compile(
    r'^\s*(On .{0,200}wrote:|-{2,}\s*Original Message\s*-{2,}|_{5,}|From:\s.+|'
    r'Sent from my \w+|Le .{0,200}a écrit\s*:)\s*$', re.I | re.M)


def strip_quoted(text):
    """The new part of a reply: drops the quoted history and '>' lines."""
    text = (text or '').replace('\r\n', '\n')
    m = _QUOTE_START.search(text)
    if m:
        text = text[:m.start()]
    lines = [ln for ln in text.split('\n') if not ln.lstrip().startswith('>')]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()[:5000]


# ------------------------------------------------------------------
# Bounces (DSN) and auto-replies
# ------------------------------------------------------------------

_DAEMON = re.compile(r'^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@', re.I)
_STATUS = re.compile(r'^\s*Status:\s*([245])\.(\d{1,3})\.(\d{1,3})', re.I | re.M)
_FINAL_RCPT = re.compile(r'^\s*(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?',
                         re.I | re.M)
_SMTP_CODE = re.compile(r'\b([45])\d\d[\s-]+([45])\.\d{1,3}\.\d{1,3}\b')
_BOUNCE_SUBJECT = re.compile(r'(undeliver|delivery status|delivery failure|failure notice|'
                             r'returned mail|mail delivery (failed|subsystem)|could not be delivered)', re.I)


def _all_text(msg):
    """Every text part (incl. message/delivery-status) — DSNs keep the status there."""
    chunks = []
    try:
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ('message/delivery-status', 'text/plain', 'text/rfc822-headers'):
                try:
                    payload = part.get_payload(decode=True)
                    if payload is None:  # delivery-status parsed into header blocks
                        payload = ''.join(str(p) for p in (part.get_payload() or []))
                    if isinstance(payload, bytes):
                        payload = payload.decode('utf-8', errors='replace')
                    chunks.append(payload)
                except Exception:
                    continue
    except Exception:
        pass
    return '\n'.join(chunks)


def detect_bounce(msg):
    """None, or {'hard': bool, 'recipient': str, 'status': '5.1.1', 'ref_ids': [...]}."""
    ctype = msg.get_content_type()
    report = ctype == 'multipart/report' and 'delivery-status' in _header(msg, 'Content-Type').lower()
    sender = sender_address(msg)
    if not (report or _DAEMON.match(sender) or
            (_BOUNCE_SUBJECT.search(_header(msg, 'Subject')) and not _header(msg, 'In-Reply-To')
             and _DAEMON.match(sender or 'x@'))):
        return None
    text = _all_text(msg)
    m = _STATUS.search(text)
    if m:
        status = '.'.join(m.groups())
    else:
        code = _SMTP_CODE.search(text)
        status = f'{code.group(2)}.0.0' if code else ''
    if status.startswith('2'):
        return None  # a delivery *success* notice
    rcpt = _FINAL_RCPT.search(text)
    ref_ids = message_ids(_header(msg, 'In-Reply-To')) + message_ids(_header(msg, 'References'))
    ref_ids += message_ids('\n'.join(re.findall(r'(?im)^\s*Message-ID:\s*(<[^>]+>)', text)))
    return {'hard': not status.startswith('4'),  # unknown status from a daemon = hard
            'status': status or 'unknown',
            'recipient': (rcpt.group(1).lower() if rcpt else ''),
            'ref_ids': ref_ids}


_OOO_SUBJECT = re.compile(r'(out of (the )?office|auto(matic)?[\s-]?reply|autoreply|'
                          r'on (annual )?leave|on vacation|away from (the )?office|abwesenheit|'
                          r'absence|i am away|currently away)', re.I)


def is_auto_reply(msg):
    auto = _header(msg, 'Auto-Submitted').strip().lower()
    if auto and auto != 'no':
        return True
    if _header(msg, 'X-Autoreply') or _header(msg, 'X-Autorespond'):
        return True
    if _header(msg, 'Precedence').strip().lower() in ('auto_reply', 'bulk', 'junk'):
        return True
    return bool(_OOO_SUBJECT.search(_header(msg, 'Subject')))


# ------------------------------------------------------------------
# Classification (LLM when available, keyword heuristic keyless)
# ------------------------------------------------------------------

_KEYWORDS = [  # first match wins — order matters (stop beats interested)
    (_C.UNSUBSCRIBE, r'\b(unsubscribe|remove me|take me off|stop (emailing|sending|contacting)|'
                     r'do not (email|contact)|don\'?t (email|contact)|opt[\s-]?out|^\s*stop\s*[.!]?\s*$)'),
    (_C.OUT_OF_OFFICE, r'\b(out of (the )?office|on (annual )?leave|on vacation|limited access to (my )?email|'
                       r'away until|back on|return(ing)? on)\b'),
    (_C.NOT_INTERESTED, r'\b(not interested|no thanks|no, thank|not for us|we(\'re| are) (all )?set|'
                        r'already have (an? )?(agency|vendor|team|partner)|don\'?t need|do not need|'
                        r'not looking)'),
    (_C.NOT_NOW, r'\b(not (right )?now|maybe later|next (quarter|month|year)|circle back|reach out (again )?'
                 r'(in|after)|later this year|busy (right now|at the moment)|not a priority)'),
    (_C.INTERESTED, r'\b(interested|let\'?s (talk|chat|connect|meet)|schedule|book a (call|meeting)|'
                    r'set up a (call|meeting)|sounds good|happy to (talk|chat)|send (me )?(more|details|a proposal|'
                    r'pricing)|call me|available (on|for)|free (on|for a call)|yes,? please)'),
    (_C.QUESTION, r'\?|\b(how much|what (is|are|do)|pricing|cost|price|who are you|how did you)\b'),
]


def classify_heuristic(text, subject=''):
    blob = f'{subject}\n{text}'.lower()
    for label, pattern in _KEYWORDS:
        if re.search(pattern, blob, re.I | re.M):
            return label, 0.6
    return _C.OTHER, 0.3


_CLASSIFY_SYSTEM = (
    'You classify a prospect\'s email reply to a B2B cold email. Answer with ONLY a JSON object: '
    '{"classification": one of ["interested","not_now","not_interested","unsubscribe",'
    '"out_of_office","question","other"], "confidence": number 0..1, "summary": one short sentence}. '
    '"unsubscribe" = they ask to stop / be removed. No prose, no code fences.')


def _parse_json(text):
    if not text:
        return None
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except (ValueError, TypeError):
        return None


def classify(text, subject=''):
    """(classification, confidence, summary).  LLM JSON first; anything
    unusable falls back to the keyword heuristic.  An explicit stop request
    always wins — the safety outcome never depends on the model."""
    from .ai import llm_available, llm_complete
    heur, heur_conf = classify_heuristic(text, subject)
    if heur == _C.UNSUBSCRIBE:
        return heur, 0.9, ''
    if llm_available():
        data = _parse_json(llm_complete(f'Subject: {subject}\n\n{text[:3000]}',
                                        system=_CLASSIFY_SYSTEM, temperature=0))
        if isinstance(data, dict) and data.get('classification') in _C.values:
            try:
                conf = max(0.0, min(1.0, float(data.get('confidence', 0.7))))
            except (TypeError, ValueError):
                conf = 0.7
            return data['classification'], conf, str(data.get('summary') or '')[:300]
    return heur, heur_conf, ''


def _first_name(reply):
    name = (reply.contact or '').split('<')[0].strip().strip('"').split(' ')[0]
    return name if name and '@' not in name else ''


def suggest_reply(reply):
    """Answer text for a human to approve (LLM, else a short template)."""
    from .ai import llm_available, llm_complete
    s = AppSettings.load()
    sender = s.company_name or 'our team'
    if llm_available():
        text = llm_complete(
            f'Their reply:\n{reply.body_text[:3000]}\n\nOur original email subject: '
            f'{reply.draft.subject if reply.draft else reply.subject}\n'
            f'Classification: {reply.classification}.',
            system=(f'You write a short, warm, plain-text email answer on behalf of {sender} to a '
                    'prospect who replied to our cold email. 60-120 words. Answer their question '
                    'if any, propose a short call, no placeholders in brackets, no subject line, '
                    'sign off with the company name.'),
            temperature=0.5)
        if text and text.strip():
            return text.strip()[:4000]
    hi = f'Hi {_first_name(reply)},' if _first_name(reply) else 'Hi,'
    if reply.classification == _C.QUESTION:
        middle = ('Thanks for getting back to me — good question. The easiest way to answer it '
                  'properly is a quick 15-minute call where I can walk you through it. '
                  'Would one day this week or next suit you?')
    else:
        middle = ('Thanks for getting back to me — glad this caught your interest. '
                  'Would a quick 15-minute call this week work? Share a time that suits you '
                  'and I\'ll send an invite.')
    return f'{hi}\n\n{middle}\n\nBest regards,\n{sender}'


# ------------------------------------------------------------------
# Matching
# ------------------------------------------------------------------

def _sent_drafts():
    return EmailDraft.objects.filter(status=_Q.SENT).exclude(message_id='')


def match_draft(msg=None, ref_ids=(), sender=''):
    """The EmailDraft this message answers (current workspace only), or None.
    1) our Message-ID in In-Reply-To / References; 2) sender == to_email of
    our most recent SENT draft."""
    ids = list(ref_ids)
    if msg is not None:
        ids += message_ids(_header(msg, 'In-Reply-To')) + message_ids(_header(msg, 'References'))
    if ids:
        draft = (EmailDraft.objects.filter(status=_Q.SENT, message_id__in=ids)
                 .order_by('-sent_at').first())
        if draft:
            return draft
    sender = (sender or (sender_address(msg) if msg is not None else '')).strip().lower()
    if sender:
        return (EmailDraft.objects.filter(status=_Q.SENT, to_email__iexact=sender)
                .order_by('-sent_at', '-id').first())
    return None


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

def _mark_lead(lead, **flags):
    if lead is None:
        return
    analysis = dict(lead.analysis or {})
    analysis.update(flags)
    lead.analysis = analysis
    lead.save(update_fields=['analysis', 'updated_at'])


def handle_bounce(info, mailbox, now=None):
    """Returns 'hard' / 'soft' / None (no matching draft)."""
    now = now or timezone.now()
    draft = match_draft(ref_ids=info['ref_ids'], sender=info['recipient']) \
        if (info['ref_ids'] or info['recipient']) else None
    if draft is None:
        return None
    if not info['hard']:
        draft.error = f'Temporary delivery problem ({info["status"]}) — the server will retry.'[:500]
        draft.save(update_fields=['error', 'updated_at'])
        return 'soft'
    address = info['recipient'] or draft.to_email
    if draft.bounced_at is None:
        draft.bounced_at = now
    draft.error = f'Bounced ({info["status"]}) — address does not accept mail.'[:500]
    draft.save(update_fields=['bounced_at', 'error', 'updated_at'])
    # keep the address on the lead (history) but never email it again
    Suppression.add(address, reason=Suppression.Reasons.BOUNCE, source='bounce')
    if address.lower() != (draft.to_email or '').lower():
        Suppression.add(draft.to_email, reason=Suppression.Reasons.BOUNCE, source='bounce')
    _mark_lead(draft.lead, email_bounced=True)
    from .sequences import stop_for_email
    if draft.enrollment_id:
        from .sequences import stop_enrollment
        stop_enrollment(draft.enrollment_id, 'Email bounced')
    stop_for_email(draft.to_email, 'Email bounced')
    from .outbox import check_bounce_pause
    check_bounce_pause(draft.mailbox or mailbox, now)
    return 'hard'


def reject_pending_to(address):
    """An unsubscribe is permanent: every not-yet-sent email to them leaves
    the queue.  APPROVED (mid-send) is caught by send_draft's own check."""
    from .mailer import SUPPRESSED_ERROR
    return EmailDraft.objects.filter(
        to_email__iexact=address, status__in=[_Q.DRAFT, _Q.QUEUED, _Q.FAILED],
    ).update(status=_Q.REJECTED, error=SUPPRESSED_ERROR, updated_at=timezone.now())


def advance_potential(lead, company):
    """Interested reply → the opportunity moves forward (at least Qualified)."""
    order = [c for c, _ in Potential.Stages.choices]
    pot = Potential.objects.filter(lead=lead).first() if lead else None
    if pot is None and lead is None:
        pot = Potential.objects.filter(company__iexact=company).first()
    if pot is None:
        return Potential.objects.create(
            company=company or (lead.company if lead else ''), lead=lead,
            opportunity='Replied to our email — interested', stage=Potential.Stages.QUALIFIED,
            owner_agent='Responder agent')
    if order.index(pot.stage) < order.index(Potential.Stages.QUALIFIED):
        pot.stage = Potential.Stages.QUALIFIED
        pot.save(update_fields=['stage', 'updated_at'])
    return pot


def _received_at(msg):
    try:
        dt = parsedate_to_datetime(_header(msg, 'Date'))
        if dt is not None and timezone.is_naive(dt):
            dt = timezone.make_aware(dt, dt_timezone.utc)
        return dt or timezone.now()
    except Exception:
        return timezone.now()


def process_message(raw, mailbox=None, now=None):
    """Handle one inbound message.  Returns a short outcome string:
    'bounce-hard', 'bounce-soft', 'ooo', 'reply', 'duplicate', 'ignored',
    'malformed'.  Never raises for bad input."""
    msg = parse_message(raw) if isinstance(raw, (bytes, bytearray)) else raw
    if msg is None:
        return 'malformed'
    now = now or timezone.now()
    bounce = detect_bounce(msg)
    if bounce is not None:
        kind = handle_bounce(bounce, mailbox, now)
        return f'bounce-{kind}' if kind else 'ignored'

    sender = sender_address(msg)
    if not sender or (mailbox is not None and sender == (mailbox.from_email or '').lower()):
        return 'ignored'
    msg_id = (message_ids(_header(msg, 'Message-ID')) or [''])[0]
    if msg_id and Reply.objects.filter(message_id=msg_id).exists():
        return 'duplicate'
    draft = match_draft(msg)
    if draft is None:
        return 'ignored'  # not about our outreach — leave it alone

    subject = _header(msg, 'Subject')[:300]
    body = strip_quoted(plain_body(msg))
    refs = ' '.join(dict.fromkeys(message_ids(_header(msg, 'References')) +
                                  message_ids(_header(msg, 'In-Reply-To'))))
    reply = Reply(
        company=draft.company, contact=_header(msg, 'From')[:200], channel=Reply.Channels.EMAIL,
        status=Reply.Statuses.REPLIED, draft=draft, lead=draft.lead,
        mailbox=draft.mailbox or mailbox, from_email=sender[:200], subject=subject,
        body_text=body, received_at=_received_at(msg), message_id=msg_id[:300], references=refs)

    if is_auto_reply(msg):
        reply.classification, reply.confidence = _C.OUT_OF_OFFICE, 0.9
        reply.summary = 'Automatic reply (out of office) — not a real answer.'
        reply.handled = True
        reply.save()
        return 'ooo'

    label, conf, summary = classify(body, subject)
    reply.classification, reply.confidence = label, conf
    reply.summary = summary or (body[:200] + ('…' if len(body) > 200 else ''))
    with transaction.atomic():
        reply.save()
        if label == _C.UNSUBSCRIBE:
            for address in {sender, (draft.to_email or '').lower()} - {''}:
                Suppression.add(address, reason=Suppression.Reasons.UNSUBSCRIBE, source='reply')
                reject_pending_to(address)
            reply.handled = True
            reply.save(update_fields=['handled'])
        if label == _C.INTERESTED:
            advance_potential(draft.lead, draft.company)
        _mark_lead(draft.lead, replied=label)
    if label in (_C.INTERESTED, _C.QUESTION):
        try:
            reply.suggested_reply = suggest_reply(reply)
            reply.save(update_fields=['suggested_reply', 'updated_at'])
        except Exception as exc:  # the reply itself is already stored
            log.warning('Suggested answer failed for reply %s: %s', reply.pk, exc)
    return 'reply'


# ------------------------------------------------------------------
# Polling
# ------------------------------------------------------------------

def _uid_list(conn, criteria):
    typ, data = conn.uid('SEARCH', None, *criteria)
    if typ != 'OK' or not data:
        return []
    return sorted(int(u) for u in (data[0] or b'').split() if u.isdigit())


def _uidvalidity(conn):
    try:
        typ, data = conn.response('UIDVALIDITY')
        return (data[0].decode() if data and data[0] else '') if typ else ''
    except Exception:
        return ''


def poll_mailbox(mailbox, now=None, cap=POLL_CAP):
    """Read new messages of one mailbox (read-only).  Returns a stats dict."""
    now = now or timezone.now()
    stats = {'fetched': 0, 'replies': 0, 'bounces': 0, 'ooo': 0, 'ignored': 0, 'error': ''}
    conn = None
    try:
        conn = open_imap(mailbox)
        typ, _ = conn.select('INBOX', readonly=True)  # readonly: nothing is marked/moved
        if typ != 'OK':
            raise OSError('could not open INBOX')
        validity = _uidvalidity(conn)
        last = mailbox.imap_last_uid or 0
        if validity and mailbox.imap_uidvalidity and validity != mailbox.imap_uidvalidity:
            last = 0  # the server renumbered the folder — restart the mark
        if last:
            uids = [u for u in _uid_list(conn, ['UID', f'{last + 1}:*']) if u > last]
        else:  # first poll: only recent mail, never the whole history
            since = (now - timedelta(days=14)).strftime('%d-%b-%Y')
            uids = _uid_list(conn, ['SINCE', since])[-FIRST_POLL_LOOKBACK:]
        for uid in uids[:cap]:
            raw = None
            try:
                typ, data = conn.uid('FETCH', str(uid), '(BODY.PEEK[])')
                if typ == 'OK':
                    raw = next((part[1] for part in data or []
                                if isinstance(part, tuple) and len(part) > 1), None)
            except imaplib.IMAP4.abort:
                raise
            except Exception as exc:
                log.warning('IMAP fetch %s failed on %s: %s', uid, mailbox.from_email, exc)
            stats['fetched'] += 1
            if raw:
                try:
                    outcome = process_message(raw, mailbox, now)
                except Exception as exc:  # one bad message never blocks the rest
                    log.warning('Inbound message %s on %s failed: %s', uid, mailbox.from_email, exc)
                    outcome = 'ignored'
                key = ('bounces' if outcome.startswith('bounce-')
                       else {'reply': 'replies', 'ooo': 'ooo'}.get(outcome, 'ignored'))
                stats[key] += 1
            last = max(last, uid)  # processed (or unreadable) — never fetched again
        mailbox.imap_last_uid = last
        mailbox.imap_uidvalidity = validity or mailbox.imap_uidvalidity
        mailbox.imap_error = ''
    except Exception as exc:
        stats['error'] = (str(exc) or exc.__class__.__name__)[:300]
        mailbox.imap_error = stats['error']
        log.warning('Inbox poll failed for %s: %s', mailbox.from_email, exc)
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass
    mailbox.imap_checked_at = now
    mailbox.save(update_fields=['imap_last_uid', 'imap_uidvalidity', 'imap_error',
                                'imap_checked_at', 'updated_at'])
    return stats


def poll_inbox(now=None):
    """Poll every active, IMAP-capable mailbox of the current workspace."""
    from .outbox import ensure_legacy_mailbox
    try:
        ensure_legacy_mailbox()
    except Exception:
        pass
    results = {}
    for mb in Mailbox.objects.filter(is_active=True).order_by('id'):
        if imap_configured(mb):
            results[mb.from_email] = poll_mailbox(mb, now)
    return results


def poll_all_workspaces():
    """Worker / command entry: each active workspace in its own context."""
    from .models import Workspace
    from .tenancy import workspace_context
    totals = {}
    for ws in Workspace.all_tenants.filter(is_active=True).order_by('id'):
        try:
            with workspace_context(ws):
                totals[ws.slug] = poll_inbox()
        except Exception as exc:
            log.warning('Inbox poll failed [%s]: %s', ws.slug, exc)
    return totals


# ------------------------------------------------------------------
# Human actions (API / chat)
# ------------------------------------------------------------------

class ApproveError(Exception):
    pass


def reply_subject(subject):
    subject = (subject or '').strip()
    return subject if re.match(r'(?i)^re\s*:', subject) else f'Re: {subject}'.strip()


def approve_suggestion(reply, text=None):
    """The human approved (optionally edited) the suggested answer: create a
    threaded EmailDraft (In-Reply-To / References = their message) and queue
    it via the outbox on the same mailbox.  Returns the queued draft."""
    from .mailer import valid_recipient
    from .outbox import enqueue_draft
    body = (text if text is not None else reply.suggested_reply or '').strip()
    if not body:
        raise ApproveError('Write an answer first.')
    to = reply.from_email or (reply.draft.to_email if reply.draft else '')
    if not valid_recipient(to):
        raise ApproveError('This reply has no valid sender address.')
    if Suppression.is_suppressed(to):
        raise ApproveError('This person asked not to be emailed again.')
    if reply.answer_draft_id and reply.answer_draft and reply.answer_draft.status in (
            _Q.QUEUED, _Q.APPROVED, _Q.SENT):
        raise ApproveError('An answer to this reply is already queued or sent.')
    refs = reply.references.split() if reply.references else []
    if reply.draft and reply.draft.message_id and reply.draft.message_id not in refs:
        refs.insert(0, reply.draft.message_id)
    answer = EmailDraft.objects.create(
        lead=reply.lead, company=reply.company, to_email=to,
        subject=reply_subject(reply.subject or (reply.draft.subject if reply.draft else ''))[:300],
        body=body, status=_Q.DRAFT, in_reply_to=reply.message_id,
        references=' '.join(dict.fromkeys(refs + ([reply.message_id] if reply.message_id else []))))
    queued = enqueue_draft(answer.pk, prefer_mailbox=reply.mailbox or (
        reply.draft.mailbox if reply.draft else None))
    reply.suggested_reply = body
    reply.answer_draft = queued or answer
    reply.handled = True
    reply.save(update_fields=['suggested_reply', 'answer_draft', 'handled', 'updated_at'])
    return queued or answer


def needs_attention_qs():
    return (Reply.objects.filter(handled=False)
            .exclude(classification__in=['', _C.OUT_OF_OFFICE, _C.UNSUBSCRIBE]))


def replies_digest(limit=5):
    """Plain-language summary of real inbound replies for the Responder /
    guide (current workspace)."""
    rows = list(Reply.objects.exclude(classification='').order_by('-received_at', '-id')[:limit])
    if not rows:
        return 'No replies from prospects yet.'
    waiting = needs_attention_qs().count()
    lines = [f'{waiting} repl{"y" if waiting == 1 else "ies"} need your attention.' if waiting
             else 'No replies waiting on you.']
    for r in rows:
        when = timezone.localtime(r.received_at).strftime('%d %b') if r.received_at else ''
        state = 'handled' if r.handled else 'needs you'
        lines.append(f'- {r.company} ({r.from_email}, {when}): {r.get_classification_display()}'
                     f' — {r.summary[:120]} [{state}]')
    return '\n'.join(lines)
