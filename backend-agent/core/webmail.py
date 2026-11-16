"""Webmail — read/send API over the user's CONNECTED mailboxes.

The Mailbox rows already store the IMAP host/port and the SMTP credentials
(masked on read, plain server-side) — this module is the IMAP/SMTP client
the webmail views drive.  stdlib ``imaplib`` only, per-request short-lived
connections with a hard 8 s timeout (same ceiling as the wizard probe in
``core.mailbox_probe``).

Contract:
  * every upstream failure raises :class:`WebmailError` whose message is
    safe to show (exception CLASS names only — server texts can quote the
    password back) → the views map it to a typed 502 detail;
  * reads never mutate: message lists fetch BODY.PEEK[1]; only the
    single-message read uses BODY[] so the server sets \\Seen (RFC 3501);
  * send goes through the existing mailer SMTP helpers, then APPENDs to
    the Sent folder best-effort (an APPEND failure never fails the send);
  * the folder map (canonical name → server path + counts) is cached
    in-memory per mailbox for 60 s; mutations drop the cache.

No network in tests: mock ``core.webmail.imaplib.IMAP4_SSL`` /
``core.webmail._open_smtp`` like test_mailbox_probe does.
"""

import email
import html as html_lib
import imaplib
import logging
import math
import re
import socket
import ssl
import time
from email import policy
from email.utils import getaddresses, parsedate_to_datetime

from django.utils import timezone
from datetime import timezone as dt_timezone

from .inbox import imap_credentials, imap_host_for
from .mailer import _open_smtp, new_message_id
from .models import Mailbox

log = logging.getLogger(__name__)

WEBMAIL_TIMEOUT = 8   # seconds per IMAP leg — hard ceiling, like the probe
PAGE_SIZE = 25        # messages per page (fixed — the UI only sends page=)
PAGE_MAX = 100
SNIPPET_LEN = 120
FOLDER_CACHE_TTL = 60             # seconds, in-memory per mailbox
CLIENT_QUERY_SCAN = 100           # newest envelopes scanned when SEARCH finds nothing

CANONICAL_ORDER = ('INBOX', 'Sent', 'Drafts', 'Junk', 'Trash')
_SPECIAL_USE = {'\\Sent': 'Sent', '\\Drafts': 'Drafts', '\\Junk': 'Junk', '\\Trash': 'Trash'}

MARK_ACTIONS = {'seen': ('+FLAGS.SILENT', '(\\Seen)'),
                'unread': ('-FLAGS.SILENT', '(\\Seen)'),
                'flagged': ('+FLAGS.SILENT', '(\\Flagged)')}

# mailbox pk → (expires_at, overview_list, {canonical: server path})
_FOLDER_CACHE = {}

_now = time.monotonic  # patched in tests to cross the cache TTL


class WebmailError(Exception):
    """Typed upstream failure — the message is display-safe (no credentials)."""


# ------------------------------------------------------------------
# Connection
# ------------------------------------------------------------------

def open_imap(mailbox, timeout=WEBMAIL_TIMEOUT):
    """Authenticated IMAP4_SSL session for one Mailbox (caller logs out).
    Same TLS fallback strategy as core.inbox, but with the 8 s webmail cap."""
    from .mailer import _ssl_contexts
    host, port = imap_host_for(mailbox), mailbox.imap_port or 993
    user, password = imap_credentials(mailbox)
    if not (host and user and password):
        raise WebmailError('Mailbox has no IMAP login configured '
                           '(Settings → Mailboxes → IMAP host / password).')
    last_error = None
    for context in _ssl_contexts():
        try:
            conn = imaplib.IMAP4_SSL(host, port, ssl_context=context, timeout=timeout)
        except ssl.SSLCertVerificationError as exc:
            last_error = exc
            continue
        except (socket.timeout, TimeoutError):
            raise WebmailError(f'IMAP timed out after {timeout}s ({host}:{port}).')
        except Exception as exc:
            raise WebmailError(f'Could not reach {host}:{port} ({exc.__class__.__name__}).')
        try:
            conn.login(user, password)
        except Exception as exc:
            _logout(conn)
            raise WebmailError(f'IMAP login rejected ({exc.__class__.__name__}).')
        return conn
    raise WebmailError(f'IMAP TLS failed ({last_error.__class__.__name__}).')


def _logout(conn):
    try:
        conn.logout()
    except Exception:
        pass


# ------------------------------------------------------------------
# IMAP response parsing (tokenizer handles nested lists, quoted
# strings and {n} literals — the shapes imaplib hands back from FETCH)
# ------------------------------------------------------------------

_WS = b' \t\r\n'
# NOTE: backslash is NOT an atom delimiter — flags like \Seen are atoms
_ATOM_END = b' (){}\t\r\n"'


def _parse_value(buf, pos):
    """(value, new_pos, eof) — one IMAP token at buf[pos:]."""
    n = len(buf)
    while pos < n and buf[pos] in _WS:
        pos += 1
    if pos >= n:
        return None, pos, True
    ch = buf[pos]
    if ch == 0x28:  # '('
        pos += 1
        items = []
        while pos < n:
            while pos < n and buf[pos] in _WS:
                pos += 1
            if pos < n and buf[pos] == 0x29:  # ')'
                pos += 1
                break
            if pos >= n:
                break
            value, pos, eof = _parse_value(buf, pos)
            if eof:
                break
            items.append(value)
        return items, pos, False
    if ch == 0x22:  # '"'
        pos += 1
        out = bytearray()
        while pos < n:
            c = buf[pos]
            pos += 1
            if c == 0x5C and pos < n:  # backslash escape
                out.append(buf[pos])
                pos += 1
                continue
            if c == 0x22:
                break
            out.append(c)
        return out.decode('utf-8', 'replace'), pos, False
    if ch == 0x7B:  # '{' literal
        end = buf.find(b'}', pos)
        if end < 0:
            return None, n, True
        try:
            size = int(buf[pos + 1:end])
        except ValueError:
            return None, n, True
        pos = end + 1
        if buf[pos:pos + 2] == b'\r\n':
            pos += 2
        elif buf[pos:pos + 1] == b'\n':
            pos += 1
        literal = buf[pos:pos + size]
        return literal.decode('utf-8', 'replace'), pos + len(literal), False
    start = pos
    while pos < n and buf[pos] not in _ATOM_END:
        pos += 1
    atom = buf[start:pos].decode('utf-8', 'replace')
    return (None if atom.upper() == 'NIL' else atom), pos, False


def parse_response(data):
    """imaplib data (bytes items + (chunk, literal) tuples) → token list."""
    stream = bytearray()
    for part in data or []:
        if isinstance(part, tuple):
            stream += part[0]
            if len(part) > 1 and isinstance(part[1], (bytes, bytearray)):
                stream += part[1]
        elif isinstance(part, (bytes, bytearray)):
            stream += part
    buf, pos, values = bytes(stream), 0, []
    while pos < len(buf):
        while pos < len(buf) and (buf[pos] in _WS or buf[pos] == 0x29):  # skip stray ')'
            pos += 1
        if pos >= len(buf):
            break
        value, pos, eof = _parse_value(buf, pos)
        if eof:
            break
        values.append(value)
    return values


def _field(tokens, key):
    for i, tok in enumerate(tokens):
        if tok == key and i + 1 < len(tokens):
            return tokens[i + 1]
    return None


def parse_folder_line(line):
    """b'(\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"' → (flags set, name)."""
    tokens = parse_response([line])
    if not tokens:
        return set(), ''
    flags = set(tokens[0]) if isinstance(tokens[0], list) else set()
    name = tokens[-1] if isinstance(tokens[-1], str) else ''
    return flags, name


def canonical_folder(name, flags=()):
    """Server folder → INBOX/Sent/Drafts/Junk/Trash, else None (not shown).
    Special-use flags win; the NAME is the fallback (Gmail labels, plain
    Dovecot folders, "Sent Items", "Deleted Messages", …)."""
    for flag, canon in _SPECIAL_USE.items():
        if flag in flags:
            return canon
    low = (name or '').strip().lower()
    if not low:
        return None
    if low == 'inbox' or low.endswith('/inbox') or low.endswith('.inbox'):
        return 'INBOX'
    if 'sent' in low:
        return 'Sent'
    if 'draft' in low:
        return 'Drafts'
    if 'spam' in low or 'junk' in low:
        return 'Junk'
    if 'trash' in low or 'deleted' in low:
        return 'Trash'
    return None


def parse_status(data):
    """STATUS data → (messages, unread); 0,0 when the server said nothing."""
    tokens = parse_response(data)
    flat = []
    for tok in tokens:
        flat.extend(tok) if isinstance(tok, list) else flat.append(tok)
    counts = {}
    for i, tok in enumerate(flat):
        if isinstance(tok, str) and i + 1 < len(flat):
            try:
                counts[tok.upper()] = int(flat[i + 1])
            except (TypeError, ValueError):
                continue
    return counts.get('MESSAGES', 0), counts.get('UNSEEN', 0)


# ------------------------------------------------------------------
# Body helpers
# ------------------------------------------------------------------

def html_to_text(html):
    """Display text from HTML (tags stripped, entities unescaped)."""
    if not html:
        return ''
    text = re.sub(r'(?is)<(script|style).*?</\1>', ' ', html)
    text = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</tr>', '\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    return html_lib.unescape(text).strip()


def _snippet(body):
    """First lines of a BODY[1] literal as one collapsed line, <=120 chars."""
    if not body:
        return ''
    text = html_to_text(body) if ('<' in body and '>' in body) else body
    return re.sub(r'\s+', ' ', text).strip()[:SNIPPET_LEN]


def _addr_str(address):
    """ENVELOPE address ((name, adl, mailbox, host)) → 'Name <a@b>'."""
    if not address:
        return ''
    name, _adl, mailbox, host = (list(address) + [None] * 4)[:4]
    addr = f'{mailbox}@{host}' if mailbox and host else (mailbox or host or '')
    if name and addr:
        return f'{name} <{addr}>'
    return name or addr or ''


def _addrs_str(field):
    """ENVELOPE address list → one 'Name <a@b>, …' string."""
    if not field:
        return ''
    return ', '.join(s for s in (_addr_str(a) for a in field) if s)


def _iso_date(value):
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return str(value or '')
    if dt is None:
        return str(value or '')
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, dt_timezone.utc)
    return dt.isoformat()


# ------------------------------------------------------------------
# Folders (cached 60 s)
# ------------------------------------------------------------------

def _cached_folders(mailbox):
    """(overview, {canonical: path}) — from cache when fresh."""
    cached = _FOLDER_CACHE.get(mailbox.pk)
    if cached and cached[0] > _now():
        return cached[1], cached[2]
    overview, paths = _fetch_folders(mailbox)
    _FOLDER_CACHE[mailbox.pk] = (_now() + FOLDER_CACHE_TTL, overview, paths)
    return overview, paths


def _fetch_folders(mailbox):
    """IMAP LIST + STATUS → canonical overview + canonical→path map."""
    conn = open_imap(mailbox)
    try:
        typ, lines = conn.list()
        if typ != 'OK':
            raise WebmailError('Could not list folders on the server.')
        paths = {'INBOX': 'INBOX'}  # always addressable
        for line in lines or []:
            flags, name = parse_folder_line(line)
            canon = canonical_folder(name, flags)
            if canon and canon not in paths and name:
                paths[canon] = name
        overview = []
        for canon in CANONICAL_ORDER:
            if canon not in paths:
                continue
            typ, data = conn.status(paths[canon], '(MESSAGES UNSEEN)')
            if typ != 'OK':
                continue  # one unhealthy folder never fails the list
            count, unread = parse_status(data)
            overview.append({'name': canon, 'count': count, 'unread': unread})
        return overview, paths
    finally:
        _logout(conn)


def folder_overview(mailbox):
    """[{name: INBOX|Sent|Drafts|Junk|Trash, count, unread}] — 60 s cache."""
    return _cached_folders(mailbox)[0]


def resolve_folder(mailbox, folder):
    """Canonical folder name (or the raw server path) → server path."""
    wanted = (folder or '').strip()
    _overview, paths = _cached_folders(mailbox)
    if wanted in paths:
        return paths[wanted]
    for path in paths.values():
        if path.lower() == wanted.lower():
            return path
    raise WebmailError(f'Folder "{wanted}" was not found on this mailbox.')


# ------------------------------------------------------------------
# Message list
# ------------------------------------------------------------------

def _search(conn, criteria):
    typ, data = conn.uid('SEARCH', None, *criteria)
    if typ != 'OK' or not data:
        return []
    return [int(u) for u in (data[0] or b'').split() if u.isdigit()]


def _fetch_envelopes(conn, uids):
    """UID list → [{uid, from, subject, date, seen, flagged, snippet}].
    ENVELOPE + FLAGS + BODY.PEEK[1] in one FETCH — never marks mail read."""
    if not uids:
        return []
    uid_set = ','.join(str(u) for u in uids)
    typ, data = conn.uid('FETCH', uid_set, '(UID FLAGS ENVELOPE BODY.PEEK[1])')
    if typ != 'OK':
        raise WebmailError('Could not fetch the message list.')
    items = []
    for value in parse_response(data):
        if not isinstance(value, list):
            continue
        try:
            uid = int(_field(value, 'UID'))
        except (TypeError, ValueError):
            continue
        flags = _field(value, 'FLAGS') or []
        envelope = _field(value, 'ENVELOPE') or []
        items.append({
            'uid': uid,
            'from': _addrs_str(envelope[2]) if len(envelope) > 2 else '',
            'subject': (envelope[1] if len(envelope) > 1 and envelope[1] else ''),
            'date': _iso_date(envelope[0]) if len(envelope) > 0 and envelope[0] else '',
            'seen': '\\Seen' in flags,
            'flagged': '\\Flagged' in flags,
            'snippet': _snippet(_field(value, 'BODY[1]')),
        })
    return items


def _page(items, page):
    total = len(items)
    pages = max(1, math.ceil(total / PAGE_SIZE))
    start = (page - 1) * PAGE_SIZE
    return items[start:start + PAGE_SIZE], total, pages


def list_messages(mailbox, folder='INBOX', page=1, query=''):
    """Envelope page, newest (highest UID) first.
    query → IMAP SEARCH (SUBJECT OR TEXT); an empty server result — or a
    non-ASCII query, which imaplib cannot even send (it ASCII-encodes the
    arguments) — falls back to a client-side filter over the newest
    CLIENT_QUERY_SCAN envelopes."""
    try:
        page = max(1, int(page or 1))
    except (TypeError, ValueError):
        page = 1
    path = resolve_folder(mailbox, folder)
    # quotes/backslashes would break the quoted SEARCH string; control
    # characters (CR/LF/…) never belong in one
    query = re.sub(r'["\\\x00-\x1f\x7f]', ' ', query or '').strip()
    conn = open_imap(mailbox)
    try:
        typ, _ = conn.select(path, readonly=True)
        if typ != 'OK':
            raise WebmailError(f'Could not open folder "{folder}".')
        if query and query.isascii():
            quoted = f'"{query}"'
            uids = _search(conn, ['OR', 'SUBJECT', quoted, 'TEXT', quoted])
            if uids:
                uids.sort(reverse=True)
                items, total, pages = _page(uids, page)
                fetched = _fetch_envelopes(conn, items)
                return {'items': fetched, 'total': total, 'page': page,
                        'pages': pages, 'perPage': PAGE_SIZE, 'folder': folder}
        if not query:  # plain page over everything, newest first
            uids = _search(conn, ['ALL'])
            uids.sort(reverse=True)
            items, total, pages = _page(uids, page)
            fetched = _fetch_envelopes(conn, items)
            return {'items': fetched, 'total': total, 'page': page,
                    'pages': pages, 'perPage': PAGE_SIZE, 'folder': folder}
        # server search empty / non-ASCII query → client-side over newest N
        scan = _search(conn, ['ALL'])[-CLIENT_QUERY_SCAN:]
        low = query.lower()
        matches = [item for item in _fetch_envelopes(conn, scan)
                   if low in item['subject'].lower()
                   or low in item['from'].lower()
                   or low in item['snippet'].lower()]
        matches.sort(key=lambda item: item['uid'], reverse=True)  # newest first
        items, total, pages = _page(matches, page)
        return {'items': items, 'total': total, 'page': page,
                'pages': pages, 'perPage': PAGE_SIZE, 'folder': folder}
    finally:
        _logout(conn)


# ------------------------------------------------------------------
# Single message (sets \Seen via BODY[])
# ------------------------------------------------------------------

def get_message(mailbox, folder='INBOX', uid=0):
    """Full message. The BODY[] fetch (no PEEK) makes the server set
    \\Seen — that is the product behaviour on open."""
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        raise WebmailError('No message uid given.')
    path = resolve_folder(mailbox, folder)
    conn = open_imap(mailbox)
    try:
        typ, _ = conn.select(path, readonly=False)
        if typ != 'OK':
            raise WebmailError(f'Could not open folder "{folder}".')
        typ, data = conn.uid('FETCH', str(uid), '(BODY[])')
        if typ != 'OK':
            raise WebmailError('Could not fetch the message.')
        raw = next((part[1] for part in (data or [])
                    if isinstance(part, tuple) and len(part) > 1
                    and isinstance(part[1], (bytes, bytearray))), None)
        if raw is None:
            raise WebmailError('Message not found in that folder.')
        try:
            msg = email.message_from_bytes(raw, policy=policy.default)
        except Exception:
            raise WebmailError('The message could not be parsed.')
        html = text = ''
        try:
            part = msg.get_body(preferencelist=('html',))
            if part is not None:
                content = part.get_content()
                html = content if isinstance(content, str) else ''
        except Exception:
            html = ''
        try:
            part = msg.get_body(preferencelist=('plain',))
            if part is not None:
                content = part.get_content()
                text = content if isinstance(content, str) else ''
        except Exception:
            text = ''
        if not text and html:
            text = html_to_text(html)
        to = [addr for _name, addr in getaddresses(msg.get_all('To', [])) if addr]
        date = str(msg.get('Date') or '')
        return {'uid': uid,
                'from': str(msg.get('From', '') or ''),
                'to': to,
                'subject': str(msg.get('Subject', '') or ''),
                'date': _iso_date(date) if date else '',
                'html': html or None,
                'text': text,
                'seen': True}
    finally:
        _logout(conn)


# ------------------------------------------------------------------
# Send (SMTP via the mailer helpers + best-effort APPEND to Sent)
# ------------------------------------------------------------------

def send_message(mailbox, to, subject, body_html, in_reply_to=''):
    """Send from the mailbox, then APPEND the copy to its Sent folder.
    Returns {ok, messageId, appendedToSent} — APPEND failures degrade."""
    from email.message import EmailMessage
    from email.utils import formatdate

    subject = (subject or '').strip()
    body_html = body_html or ''
    msg = EmailMessage()
    msg['From'] = mailbox.from_email
    msg['To'] = (to or '').strip()
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    message_id = new_message_id(mailbox.from_email)
    msg['Message-ID'] = message_id
    if in_reply_to:
        msg['In-Reply-To'] = in_reply_to
        msg['References'] = in_reply_to
    text = html_to_text(body_html) if '<' in body_html else body_html
    msg.set_content(text or '(no content)')
    msg.add_alternative(body_html or '<p></p>', subtype='html')
    with _open_smtp(mailbox) as server:
        server.send_message(msg)
    appended = _append_sent(mailbox, msg.as_bytes())
    return {'ok': True, 'messageId': message_id, 'appendedToSent': appended}


def _append_sent(mailbox, raw):
    """IMAP APPEND the just-sent copy into Sent, flagged \\Seen."""
    try:
        _overview, paths = _cached_folders(mailbox)
        sent = paths.get('Sent')
        if not sent:
            return False
        conn = open_imap(mailbox)
        try:
            typ, _data = conn.append(sent, '\\Seen', None, raw)
            return typ == 'OK'
        finally:
            _logout(conn)
    except Exception as exc:  # best-effort: the send already succeeded
        log.info('Webmail APPEND to Sent failed for %s: %s',
                 mailbox.from_email, exc.__class__.__name__)
        return False


# ------------------------------------------------------------------
# Mark (seen / unread / flagged / trash)
# ------------------------------------------------------------------

def mark_messages(mailbox, folder, uids, action):
    """STORE flags; trash = COPY to Trash + STORE \\Deleted + EXPUNGE.
    A COPY that fails is skipped, not fatal — the succeeded copies are
    still deleted, and the response reports the failed count."""
    if action not in MARK_ACTIONS and action != 'trash':
        raise ValueError(f'Unknown mark action: {action}')
    try:
        uid_list = sorted({int(u) for u in uids})
    except (TypeError, ValueError):
        raise ValueError('uids must be numbers.')
    if not uid_list:
        raise ValueError('No messages given.')
    path = resolve_folder(mailbox, folder)
    conn = open_imap(mailbox)
    try:
        typ, _ = conn.select(path)
        if typ != 'OK':
            raise WebmailError(f'Could not open folder "{folder}".')
        if action == 'trash':
            trash_path = resolve_folder(mailbox, 'Trash')
            succeeded, failed = [], 0
            for uid in uid_list:
                try:
                    copy_typ, _data = conn.uid('COPY', str(uid), trash_path)
                except Exception as exc:
                    log.info('Webmail COPY to Trash failed for uid %s on %s: %s',
                             uid, mailbox.from_email, exc.__class__.__name__)
                    copy_typ = 'NO'
                if copy_typ != 'OK':
                    failed += 1
                    continue
                succeeded.append(uid)
            if not succeeded:
                raise WebmailError('Could not copy any of the messages to Trash.')
            uid_set = ' '.join(str(u) for u in succeeded)
            typ, _data = conn.uid('STORE', uid_set, '+FLAGS.SILENT', '(\\Deleted)')
            if typ != 'OK':
                raise WebmailError('Could not delete the messages.')
            expunged = 0
            try:
                exp_typ, exp_data = conn.expunge()
                if exp_typ == 'OK' and exp_data and exp_data[0]:
                    expunged = len(exp_data[0].split())
            except Exception as exc:
                log.info('Webmail EXPUNGE failed on %s: %s',
                         mailbox.from_email, exc.__class__.__name__)
            _FOLDER_CACHE.pop(mailbox.pk, None)  # counts just changed
            return {'ok': len(succeeded), 'failed': failed, 'expunged': expunged}
        uid_set = ' '.join(str(u) for u in uid_list)
        mode, flags = MARK_ACTIONS[action]
        typ, _data = conn.uid('STORE', uid_set, mode, flags)
        if typ != 'OK':
            raise WebmailError('The server refused the flag change.')
        _FOLDER_CACHE.pop(mailbox.pk, None)  # counts just changed
        return {'ok': len(uid_list)}
    finally:
        _logout(conn)


# ------------------------------------------------------------------
# Accounts (the webmail sidebar list)
# ------------------------------------------------------------------

def provider_for(mailbox):
    """Provider label from the mailbox domain/hosts (display only)."""
    domain = (mailbox.from_email or '').rsplit('@', 1)[-1].lower()
    host = (mailbox.smtp_host or '').lower()
    for provider in ('gmail', 'zoho', 'outlook', 'yahoo'):
        if provider in domain or provider in host:
            return provider
    return 'custom'


def list_accounts():
    """One row per CONFIGURED mailbox with its INBOX unread count.
    An unreachable account degrades to unread=null + unreachable=true —
    the list itself never 500s."""
    accounts = []
    configured = [mb for mb in Mailbox.objects.order_by('id') if mb.configured()]
    for index, mb in enumerate(configured):
        account = {'id': mb.pk, 'email': mb.from_email,
                   'provider': provider_for(mb), 'is_primary': index == 0,
                   'unread': None, 'unreachable': False, 'error': ''}
        try:
            conn = open_imap(mb)
            try:
                typ, data = conn.status('INBOX', '(MESSAGES UNSEEN)')
                if typ == 'OK':
                    _count, unread = parse_status(data)
                    account['unread'] = unread
                else:
                    account['unreachable'] = True
                    account['error'] = 'The server would not report the inbox.'
            finally:
                _logout(conn)
        except WebmailError as exc:
            account['unreachable'] = True
            account['error'] = str(exc)
        except Exception as exc:  # never 500 the accounts list
            account['unreachable'] = True
            account['error'] = exc.__class__.__name__
        accounts.append(account)
    return accounts
