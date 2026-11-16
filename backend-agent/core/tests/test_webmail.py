"""Webmail — the mailbox reader/writer API over the user's connected
mailboxes (core.webmail).  No network: imaplib is mocked at the module
boundary exactly like test_mailbox_probe does; SMTP goes through a mocked
core.webmail._open_smtp.

Covers: folder special-use mapping + name fallback, 60 s folder cache,
pagination math, ENVELOPE parsing, snippet extraction (<=120 chars),
\\Seen set on read (BODY[] not PEEK), send appends to Sent via APPEND,
trash = COPY + STORE \\Deleted + EXPUNGE, per-account degradation (never
a 500 on the accounts list), auth + tenant scoping like sibling views.
"""

from unittest import mock

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import webmail
from core.models import Mailbox, User

from .base import TenantTestCase

WEBMAIL_TIMEOUT = webmail.WEBMAIL_TIMEOUT


# ------------------------------------------------------------------
# imaplib response fixtures (real shapes imaplib hands back)
# ------------------------------------------------------------------

LIST_GMAIL = [
    b'(\\HasNoChildren) "/" "INBOX"',
    b'(\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"',
    b'(\\HasNoChildren \\Drafts) "/" "[Gmail]/Drafts"',
    b'(\\HasNoChildren \\Junk) "/" "[Gmail]/Spam"',
    b'(\\HasNoChildren \\Trash) "/" "[Gmail]/Trash"',
]

# no special-use flags — mapping must fall back to the folder NAME
LIST_PLAIN = [
    b'(\\HasNoChildren) "." "INBOX"',
    b'(\\HasNoChildren) "." "Sent Items"',
    b'(\\HasNoChildren) "." "Drafts"',
    b'(\\HasNoChildren) "." "Spam"',
    b'(\\HasNoChildren) "." "Deleted Messages"',
    b'(\\HasNoChildren) "." "Personal"',  # unmapped — never listed
]


def env_item(uid, subject='Hello there', from_name='Ann Lee', from_addr='ann@ex.com',
             date=b'"Mon, 04 Nov 2026 10:00:00 +0530"', flags=b'',
             body=b'First line of the body.\nSecond line continues here.'):
    """One FETCH response item: (header-with-{n}-literal, literal bytes)."""
    local, _, dom = from_addr.partition('@')
    env = (b'ENVELOPE (' + date + b' "' + subject.encode() + b'" '
           b'(("' + from_name.encode() + b'" NIL "' + local.encode() + b'" "' + dom.encode() + b'")) '
           b'NIL NIL NIL NIL NIL NIL NIL)')
    head = (str(uid).encode() + b' (UID ' + str(uid).encode() + b' FLAGS (' + flags + b') '
            + env + b' BODY[1] {' + str(len(body)).encode() + b'}\r\n')
    return (head, body + b')')  # the literal is followed by the item's closing paren


RAW_MESSAGE = (
    b'From: Ann Lee <ann@ex.com>\r\n'
    b'To: sales@sender.com\r\n'
    b'Subject: Quote request\r\n'
    b'Date: Mon, 04 Nov 2026 10:00:00 +0530\r\n'
    b'Message-ID: <quote-1@ex.com>\r\n'
    b'Content-Type: multipart/alternative; boundary="BOUND"\r\n\r\n'
    b'--BOUND\r\nContent-Type: text/plain\r\n\r\nplain body text\r\n'
    b'--BOUND\r\nContent-Type: text/html\r\n\r\n<p>html body</p>\r\n'
    b'--BOUND--\r\n')


def imap_mock(**over):
    conn = mock.MagicMock(name='imap')
    conn.login.return_value = ('OK', [b'Logged in'])
    conn.select.return_value = ('OK', [b'[READ-WRITE] 3'])
    conn.logout.return_value = ('BYE', [b''])
    conn.list.return_value = ('OK', over.get('list', LIST_GMAIL))
    counts = over.get('counts', {})  # path -> (messages, unseen)

    def status(path, _what):
        messages, unseen = counts.get(path, (5, 2))
        return ('OK', [f'{path} (MESSAGES {messages} UNSEEN {unseen})'.encode()])

    conn.status.side_effect = status
    conn.append.return_value = ('OK', [b'Append completed'])
    conn.expunge.return_value = ('OK', [b'3 7'])
    if 'uid' in over:
        conn.uid.side_effect = over['uid']
    else:
        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'1 2 3'])
            return ('OK', [env_item(1), env_item(2), env_item(3), b')'])
        conn.uid.side_effect = uid
    return conn


def make_mailbox(**over):
    fields = dict(label='Sales', from_email='sales@sender.com',
                  smtp_host='smtp.gmail.com', smtp_port=587,
                  smtp_user='sales@sender.com', smtp_password='secret-pass')
    fields.update(over)
    return Mailbox.objects.create(**fields)


# ------------------------------------------------------------------
# Service: folders
# ------------------------------------------------------------------

class FolderMappingTests(TenantTestCase):

    def setUp(self):
        webmail._FOLDER_CACHE.clear()
        self.mb = make_mailbox()

    def test_special_use_flags_map(self):
        conn = imap_mock(counts={'INBOX': (12, 4), '[Gmail]/Sent Mail': (30, 0),
                                 '[Gmail]/Drafts': (2, 0), '[Gmail]/Spam': (7, 7),
                                 '[Gmail]/Trash': (1, 0)})
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            folders = webmail.folder_overview(self.mb)
        self.assertEqual([f['name'] for f in folders],
                         ['INBOX', 'Sent', 'Drafts', 'Junk', 'Trash'])
        by_name = {f['name']: f for f in folders}
        self.assertEqual(by_name['INBOX'], {'name': 'INBOX', 'count': 12, 'unread': 4})
        self.assertEqual(by_name['Junk'], {'name': 'Junk', 'count': 7, 'unread': 7})
        self.assertEqual(by_name['Sent']['count'], 30)
        # every folder STATUSed exactly once
        self.assertEqual(conn.status.call_count, 5)

    def test_name_fallback_without_flags(self):
        conn = imap_mock(list=LIST_PLAIN)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            folders = webmail.folder_overview(self.mb)
        self.assertEqual([f['name'] for f in folders],
                         ['INBOX', 'Sent', 'Drafts', 'Junk', 'Trash'])
        by_name = {f['name']: f for f in folders}
        self.assertEqual(by_name['Sent']['count'], 5)  # default counts shape parsed

    def test_cache_60s(self):
        conn = imap_mock()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            webmail.folder_overview(self.mb)
            webmail.folder_overview(self.mb)
            self.assertEqual(conn.list.call_count, 1, 'second call served from cache')
            with mock.patch.object(webmail, '_now', return_value=webmail._now() + 61):
                webmail.folder_overview(self.mb)
            self.assertEqual(conn.list.call_count, 2, 'cache expired after 60s')

    def test_unreachable_raises_typed_error(self):
        with mock.patch('core.webmail.imaplib.IMAP4_SSL',
                        side_effect=ConnectionRefusedError('refused')):
            with self.assertRaises(webmail.WebmailError) as ctx:
                webmail.folder_overview(self.mb)
        self.assertIn('could not reach', str(ctx.exception).lower())

    def test_login_rejected_is_typed_and_safe(self):
        import imaplib
        conn = mock.MagicMock()
        conn.login.side_effect = imaplib.IMAP4.error('AUTHENTICATIONFAILED (secret-pass)')
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            with self.assertRaises(webmail.WebmailError) as ctx:
                webmail.folder_overview(self.mb)
        self.assertIn('login', str(ctx.exception).lower())
        self.assertNotIn('secret-pass', str(ctx.exception))


# ------------------------------------------------------------------
# Service: message list (pagination, envelope, snippet, query)
# ------------------------------------------------------------------

class MessageListTests(TenantTestCase):

    def setUp(self):
        self.mb = make_mailbox()
        webmail._FOLDER_CACHE.clear()

    def test_pagination_math_newest_first(self):
        all_uids = list(range(1, 61))  # 60 messages

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [' '.join(map(str, all_uids)).encode()])
            if cmd == 'FETCH':
                return ('OK', [env_item(int(u)) for u in args[0].split(',')] + [b')'])
            return ('OK', [b''])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            page2 = webmail.list_messages(self.mb, folder='INBOX', page=2)
        self.assertEqual(page2['total'], 60)
        self.assertEqual(page2['page'], 2)
        self.assertEqual(page2['pages'], 3)
        self.assertEqual(len(page2['items']), 25)
        self.assertEqual(page2['items'][0]['uid'], 35, 'newest first: page 2 starts at uid 35')
        self.assertEqual(page2['items'][-1]['uid'], 11)
        item = page2['items'][0]
        self.assertEqual(set(item),
                         {'uid', 'from', 'subject', 'date', 'seen', 'flagged', 'snippet'})

    def test_envelope_and_snippet(self):
        long_body = 'word ' * 60  # 300 chars → snippet must be cut to <=120

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'7'])
            return ('OK', [env_item(7, subject='Quarterly report',
                                    from_name='Bob', from_addr='bob@corp.io',
                                    flags=b'\\Seen \\Flagged',
                                    body=long_body.encode()), b')'])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.list_messages(self.mb, folder='INBOX', page=1)
        item = result['items'][0]
        self.assertEqual(item['from'], 'Bob <bob@corp.io>')
        self.assertEqual(item['subject'], 'Quarterly report')
        self.assertTrue(item['seen'])
        self.assertTrue(item['flagged'])
        self.assertLessEqual(len(item['snippet']), 120)
        self.assertTrue(item['snippet'].startswith('word word'))
        self.assertIn('2026-11-04', item['date'])
        # envelope page must never mark messages read
        fetch_args = [c for c in conn.uid.call_args_list if c.args[0] == 'FETCH'][0]
        self.assertEqual(fetch_args.args[2], '(UID FLAGS ENVELOPE BODY.PEEK[1])')

    def test_query_uses_server_search(self):
        def uid(cmd, *args):
            if cmd == 'SEARCH':
                if any('invoice' in str(a) for a in args):  # the query search
                    return ('OK', [b'9'])
                return ('OK', [b'1 2 9'])
            return ('OK', [env_item(9, subject='Invoice for October')])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.list_messages(self.mb, folder='INBOX', query='invoice')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['uid'], 9)
        searched = [c for c in conn.uid.call_args_list
                    if c.args[0] == 'SEARCH'
                    and any('invoice' in str(a) for a in c.args)]
        self.assertTrue(searched, 'query must go to IMAP SEARCH')

    def test_query_client_fallback_when_server_search_empty(self):
        def uid(cmd, *args):
            if cmd == 'SEARCH':
                if any('invoice' in str(a) for a in args):
                    return ('OK', [b''])  # server search finds nothing
                return ('OK', [b'1 2 3'])
            return ('OK', [env_item(1, subject='Invoice A'),
                           env_item(2, subject='Weekly update'),
                           env_item(3, subject='Invoice B')])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.list_messages(self.mb, folder='INBOX', query='invoice')
        self.assertEqual(result['total'], 2)
        # fallback matches keep the newest-first contract (descending uid)
        self.assertEqual([item['uid'] for item in result['items']], [3, 1])

    def test_non_ascii_query_skips_server_search(self):
        """imaplib ASCII-encodes SEARCH args — a non-ASCII query must go
        straight to the client-side scan, never raise (and never 400)."""
        def uid(cmd, *args):
            if cmd == 'SEARCH':
                for arg in args:  # mimic imaplib's ascii encoding
                    if isinstance(arg, str) and not arg.isascii():
                        raise UnicodeEncodeError('ascii', 'x', 0, 1, 'not ascii')
                if any('invoice' in str(a) for a in args):
                    return ('OK', [b''])
                return ('OK', [b'1 2'])
            return ('OK', [env_item(1, subject='Invoice 发票 attached'),
                           env_item(2, subject='Hello')])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.list_messages(self.mb, folder='INBOX', query='发票')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['uid'], 1)
        for call in conn.uid.call_args_list:  # the query never reached the server
            if call.args[0] == 'SEARCH':
                self.assertTrue(all(a.isascii() for a in call.args if isinstance(a, str)))

    def test_unknown_folder_raises(self):
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=imap_mock()):
            with self.assertRaises(webmail.WebmailError):
                webmail.list_messages(self.mb, folder='NoSuch', page=1)


class ReadMessageTests(TenantTestCase):

    def setUp(self):
        self.mb = make_mailbox()
        webmail._FOLDER_CACHE.clear()

    def test_read_sets_seen_and_parses_body(self):
        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'5'])
            return ('OK', [(b'1 (UID 5 BODY[] {' + str(len(RAW_MESSAGE)).encode()
                            + b'}\r\n', RAW_MESSAGE), b')'])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            msg = webmail.get_message(self.mb, folder='INBOX', uid=5)
        self.assertEqual(msg['uid'], 5)
        self.assertEqual(msg['from'], 'Ann Lee <ann@ex.com>')
        self.assertEqual(msg['to'], ['sales@sender.com'])
        self.assertEqual(msg['subject'], 'Quote request')
        self.assertEqual(msg['message_id'], '<quote-1@ex.com>')
        self.assertIn('plain body text', msg['text'])
        self.assertIn('<p>html body</p>', msg['html'])
        self.assertTrue(msg['seen'], 'BODY[] fetch marks the message read')
        fetch_args = [c for c in conn.uid.call_args_list if c.args[0] == 'FETCH'][0]
        self.assertEqual(fetch_args.args[2], '(BODY[])')
        # read-write SELECT (a readonly select would refuse to set \Seen)
        conn.select.assert_called_with('INBOX', readonly=False)

    def test_read_message_id_null_safe_when_missing(self):
        raw = RAW_MESSAGE.replace(b'Message-ID: <quote-1@ex.com>\r\n', b'')

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'5'])
            return ('OK', [(b'1 (UID 5 BODY[] {' + str(len(raw)).encode()
                            + b'}\r\n', raw), b')'])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            msg = webmail.get_message(self.mb, folder='INBOX', uid=5)
        self.assertEqual(msg['subject'], 'Quote request')
        self.assertEqual(msg['message_id'], '')


# ------------------------------------------------------------------
# Service: send + mark
# ------------------------------------------------------------------

class SendTests(TenantTestCase):

    def setUp(self):
        self.mb = make_mailbox()
        webmail._FOLDER_CACHE.clear()

    def test_send_appends_to_sent(self):
        smtp = mock.MagicMock(name='smtp')
        smtp.__enter__.return_value = smtp  # `with _open_smtp(...) as server`
        smtp.__exit__.return_value = False
        conn = imap_mock()
        with mock.patch('core.webmail._open_smtp', return_value=smtp), \
                mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.send_message(
                self.mb, to='ann@ex.com', subject='Re: Quote request',
                body_html='<p>Here is the quote.</p>', in_reply_to='<quote-1@ex.com>')
        self.assertTrue(result['ok'])
        self.assertTrue(result['appendedToSent'])
        self.assertTrue(smtp.send_message.called)
        sent_msg = smtp.send_message.call_args.args[0]
        self.assertEqual(sent_msg['To'], 'ann@ex.com')
        self.assertEqual(sent_msg['Subject'], 'Re: Quote request')
        self.assertEqual(sent_msg['In-Reply-To'], '<quote-1@ex.com>')
        self.assertEqual(sent_msg['From'], 'sales@sender.com')
        conn.append.assert_called_once()
        append_args = conn.append.call_args.args
        self.assertEqual(append_args[0], '[Gmail]/Sent Mail')
        self.assertEqual(append_args[1], '\\Seen')
        self.assertIn(b'Subject: Re: Quote request', append_args[-1])

    def test_send_int_in_reply_to_does_not_crash(self):
        """The frontend once sent the numeric uid as in_reply_to — that must
        never 502 the reply: the header is omitted, the send succeeds."""
        smtp = mock.MagicMock(name='smtp')
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        conn = imap_mock()
        with mock.patch('core.webmail._open_smtp', return_value=smtp), \
                mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.send_message(self.mb, to='ann@ex.com', subject='Re: Quote',
                                          body_html='<p>x</p>', in_reply_to=5)
        self.assertTrue(result['ok'])
        sent_msg = smtp.send_message.call_args.args[0]
        self.assertNotIn('In-Reply-To', sent_msg)
        self.assertNotIn('References', sent_msg)

    def test_send_string_in_reply_to_sets_header(self):
        smtp = mock.MagicMock(name='smtp')
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        with mock.patch('core.webmail._open_smtp', return_value=smtp), \
                mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=imap_mock()):
            webmail.send_message(self.mb, to='ann@ex.com', subject='Re: Quote',
                                 body_html='<p>x</p>', in_reply_to='<quote-1@ex.com>')
        sent_msg = smtp.send_message.call_args.args[0]
        self.assertEqual(sent_msg['In-Reply-To'], '<quote-1@ex.com>')
        self.assertEqual(sent_msg['References'], '<quote-1@ex.com>')

    def test_append_failure_is_best_effort(self):
        conn = imap_mock()
        conn.append.side_effect = Exception('append failed')
        with mock.patch('core.webmail._open_smtp', return_value=mock.MagicMock()), \
                mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.send_message(self.mb, to='ann@ex.com', subject='Hi',
                                          body_html='<p>x</p>')
        self.assertTrue(result['ok'], 'SMTP send already succeeded')
        self.assertFalse(result['appendedToSent'])


class MarkTests(TenantTestCase):

    def setUp(self):
        self.mb = make_mailbox()
        webmail._FOLDER_CACHE.clear()

    def test_mark_seen_and_unread(self):
        conn = imap_mock()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            self.assertEqual(webmail.mark_messages(self.mb, 'INBOX', [3, 7], 'seen'), {'ok': 2})
        conn.uid.assert_called_with('STORE', '3 7', '+FLAGS.SILENT', '(\\Seen)')
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            webmail.mark_messages(self.mb, 'INBOX', [3], 'unread')
        conn.uid.assert_called_with('STORE', '3', '-FLAGS.SILENT', '(\\Seen)')

    def test_mark_flagged(self):
        conn = imap_mock()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            webmail.mark_messages(self.mb, 'INBOX', [9], 'flagged')
        conn.uid.assert_called_with('STORE', '9', '+FLAGS.SILENT', '(\\Flagged)')

    def test_trash_is_copy_store_expunge(self):
        conn = imap_mock()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.mark_messages(self.mb, 'INBOX', [3, 7], 'trash')
        self.assertEqual(result, {'ok': 2, 'failed': 0, 'expunged': 2})
        # c[0] is the method name — _Call.name is not usable on this Python
        names = [(c[0], c.args) for c in conn.mock_calls]
        copies = [a for n, a in names if n == 'uid' and a[0] == 'COPY']
        stores = [a for n, a in names if n == 'uid' and a[0] == 'STORE']
        expunges = [n for n, _ in names if n == 'expunge']
        self.assertEqual(copies, [('COPY', '3', '[Gmail]/Trash'), ('COPY', '7', '[Gmail]/Trash')])
        self.assertEqual(stores, [('STORE', '3 7', '+FLAGS.SILENT', '(\\Deleted)')])
        self.assertEqual(expunges, ['expunge'])
        # COPY must happen before the delete+expunge
        self.assertTrue(names.index(('uid', copies[0])) < names.index(('uid', stores[0])))
        self.assertTrue(names.index(('uid', stores[0])) < names.index(('expunge', ())))

    def test_trash_partial_copy_failure(self):
        """A COPY that fails is skipped, not fatal: the succeeded ones are
        still deleted + expunged, and the response reports the failure."""
        def uid(cmd, *args):
            if cmd == 'COPY' and args[0] == '7':
                return ('NO', [b'COPY failed'])
            return ('OK', [b'done'])
        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            result = webmail.mark_messages(self.mb, 'INBOX', [3, 7], 'trash')
        self.assertEqual(result['ok'], 1)
        self.assertEqual(result['failed'], 1)
        self.assertEqual(result['expunged'], 2)  # expunge result surfaces
        stores = [c.args for c in conn.uid.call_args_list if c.args[0] == 'STORE']
        self.assertEqual(stores, [('STORE', '3', '+FLAGS.SILENT', '(\\Deleted)')])

    def test_invalid_action_raises_value_error(self):
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=imap_mock()):
            with self.assertRaises(ValueError):
                webmail.mark_messages(self.mb, 'INBOX', [1], 'explode')


# ------------------------------------------------------------------
# Endpoints — auth, tenant scoping, degradation
# ------------------------------------------------------------------

class WebmailEndpointTests(TenantTestCase):

    def setUp(self):
        webmail._FOLDER_CACHE.clear()
        self.owner = User.objects.create_user(username='wown', password='pw123456', role='owner')
        self.member = User.objects.create_user(username='wmem', password='pw123456', role='member')
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')
        self.mclient = APIClient()
        self.mclient.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.member).key}')

    def test_accounts_shape_and_gate(self):
        first = make_mailbox()
        make_mailbox(label='Broken', from_email='nope@sender.com', smtp_password='')
        conn = imap_mock(counts={'INBOX': (9, 3)})
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.get('/api/webmail/accounts/')
        self.assertEqual(r.status_code, 200, r.content)
        accounts = r.json()
        self.assertEqual(len(accounts), 1, 'only configured() mailboxes are listed')
        acc = accounts[0]
        self.assertEqual(acc['id'], first.pk)
        self.assertEqual(acc['email'], 'sales@sender.com')
        self.assertEqual(acc['provider'], 'gmail')
        self.assertTrue(acc['is_primary'])
        self.assertEqual(acc['unread'], 3)
        self.assertNotIn('secret-pass', r.content.decode())

    def test_accounts_never_500s_when_unreachable(self):
        make_mailbox()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL',
                        side_effect=ConnectionRefusedError('refused')):
            r = self.client.get('/api/webmail/accounts/')
        self.assertEqual(r.status_code, 200, r.content)
        acc = r.json()[0]
        self.assertIsNone(acc['unread'])
        self.assertTrue(acc['unreachable'])
        self.assertNotIn('secret-pass', r.content.decode())

    def test_folders_endpoint(self):
        mb = make_mailbox()
        conn = imap_mock(counts={'INBOX': (12, 4)})
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.get(f'/api/webmail/{mb.pk}/folders/')
        self.assertEqual(r.status_code, 200, r.content)
        folders = r.json()
        self.assertEqual([f['name'] for f in folders],
                         ['INBOX', 'Sent', 'Drafts', 'Junk', 'Trash'])
        self.assertEqual(folders[0], {'name': 'INBOX', 'count': 12, 'unread': 4})

    def test_messages_endpoint_page_shape(self):
        mb = make_mailbox()

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'1 2 3'])
            return ('OK', [env_item(3), env_item(2), env_item(1), b')'])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.get(f'/api/webmail/{mb.pk}/messages/?folder=INBOX&page=1')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['total'], 3)
        self.assertEqual(len(body['items']), 3)
        self.assertEqual(body['items'][0]['uid'], 3, 'newest first')

    def test_message_endpoint(self):
        mb = make_mailbox()

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                return ('OK', [b'5'])
            return ('OK', [(b'1 (UID 5 BODY[] {' + str(len(RAW_MESSAGE)).encode()
                            + b'}\r\n', RAW_MESSAGE), b')'])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.get(f'/api/webmail/{mb.pk}/message/?folder=INBOX&uid=5')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['subject'], 'Quote request')
        self.assertTrue(body['seen'])

    def test_unicode_digit_uid_is_a_400_not_500(self):
        """"²".isdigit() is True but int("²") raises — must be a clean 400."""
        mb = make_mailbox()
        r = self.client.get(f'/api/webmail/{mb.pk}/message/?folder=INBOX&uid=²')
        self.assertEqual(r.status_code, 400, r.content)

    def test_non_ascii_query_endpoint_returns_fallback_not_400(self):
        mb = make_mailbox()

        def uid(cmd, *args):
            if cmd == 'SEARCH':
                for arg in args:  # mimic imaplib's ascii encoding
                    if isinstance(arg, str) and not arg.isascii():
                        raise UnicodeEncodeError('ascii', 'x', 0, 1, 'not ascii')
                return ('OK', [b'1'])
            return ('OK', [env_item(1, subject='Invoice 发票 attached')])

        conn = imap_mock(uid=uid)
        with mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.get(f'/api/webmail/{mb.pk}/messages/?folder=INBOX&query=发票')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['total'], 1)

    def test_send_endpoint_requires_to(self):
        mb = make_mailbox()
        r = self.client.post(f'/api/webmail/{mb.pk}/send/',
                             {'subject': 'Hi', 'body_html': '<p>x</p>'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'/api/webmail/{mb.pk}/send/',
                             {'to': 'not-an-address', 'subject': 'Hi',
                              'body_html': '<p>x</p>'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_mark_endpoint_validation(self):
        mb = make_mailbox()
        r = self.client.post(f'/api/webmail/{mb.pk}/mark/',
                             {'folder': 'INBOX', 'uids': [], 'action': 'seen'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'/api/webmail/{mb.pk}/mark/',
                             {'folder': 'INBOX', 'uids': [1], 'action': 'explode'},
                             format='json')
        self.assertEqual(r.status_code, 400)

    def test_upstream_failure_maps_to_502_not_500(self):
        mb = make_mailbox()
        with mock.patch('core.webmail.imaplib.IMAP4_SSL',
                        side_effect=ConnectionRefusedError('refused')):
            r = self.client.get(f'/api/webmail/{mb.pk}/folders/')
        self.assertEqual(r.status_code, 502, r.content)
        self.assertIn('detail', r.json())

    def test_requires_login(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/webmail/accounts/').status_code, 401)

    def test_member_forbidden(self):
        mb = make_mailbox()
        self.assertEqual(self.mclient.get('/api/webmail/accounts/').status_code, 403)
        self.assertEqual(self.mclient.get(f'/api/webmail/{mb.pk}/folders/').status_code, 403)

    def test_mailbox_not_found(self):
        self.assertEqual(self.client.get('/api/webmail/999/folders/').status_code, 404)

    def test_send_endpoint_ok(self):
        mb = make_mailbox()
        conn = imap_mock()
        with mock.patch('core.webmail._open_smtp', return_value=mock.MagicMock()), \
                mock.patch('core.webmail.imaplib.IMAP4_SSL', return_value=conn):
            r = self.client.post(f'/api/webmail/{mb.pk}/send/',
                                 {'to': 'ann@ex.com', 'subject': 'Hi',
                                  'body_html': '<p>hello</p>'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['ok'])
        self.assertTrue(conn.append.called)
