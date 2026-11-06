"""Public unsubscribe endpoint — the only unauthenticated write in the API.

    GET  /api/unsubscribe/<token>/   confirmation page with one button
    POST /api/unsubscribe/<token>/   suppress the address (the button, and the
                                     RFC 8058 one-click POST mail clients send)

GET never writes: link scanners and mail-security proxies prefetch every URL
in an email, and a prefetch must not unsubscribe anyone.  The signed token
(mailer.unsubscribe_token) names exactly one workspace + address, so the
endpoint cannot be used to suppress anything else.  Writes run inside that
workspace's context, so tenant isolation holds without a signed-in user."""

import html
import logging

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .mailer import read_unsubscribe_token
from .models import AppSettings, EmailDraft, Suppression, Workspace
from .tenancy import workspace_context

log = logging.getLogger(__name__)


def _page(title, message, form=False, status=200):
    button = ('<form method="post"><button type="submit" style="background:#e8720c;color:#fff;'
              'border:0;border-radius:8px;padding:12px 22px;font-size:15px;cursor:pointer">'
              'Unsubscribe</button></form>') if form else ''
    body = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex,nofollow">'
        f'<title>{html.escape(title)}</title></head>'
        '<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">'
        '<div style="max-width:480px;margin:12vh auto;background:#fff;border-radius:10px;'
        'padding:32px;text-align:center;color:#1f2937">'
        f'<h1 style="font-size:20px;margin:0 0 12px">{html.escape(title)}</h1>'
        f'<p style="font-size:15px;line-height:1.6;margin:0 0 20px">{message}</p>'
        f'{button}</div></body></html>'
    )
    return HttpResponse(body, status=status, content_type='text/html; charset=utf-8')


@csrf_exempt  # the token is the credential; mail clients POST without a CSRF cookie
@require_http_methods(['GET', 'POST'])
def unsubscribe_view(request, token):
    parsed = read_unsubscribe_token(token)
    ws = Workspace.objects.filter(pk=parsed[0]).first() if parsed else None
    if ws is None or not parsed[1]:
        return _page('Link not valid',
                     'This unsubscribe link is broken or incomplete. Reply to the email '
                     'with "unsubscribe" and we will remove you by hand.', status=400)
    email = parsed[1]

    with workspace_context(ws):
        sender = html.escape(AppSettings.load().company_name or ws.name)
        shown = html.escape(email)
        if request.method == 'GET':
            if Suppression.is_suppressed(email):
                return _page('You are unsubscribed',
                             f'{shown} will not receive any more emails from {sender}.')
            return _page('Unsubscribe?',
                         f'Stop all emails from {sender} to {shown}?', form=True)

        Suppression.add(email, Suppression.Reasons.UNSUBSCRIBE,
                        source='one-click' if 'List-Unsubscribe' in request.POST else 'link')
        # pending drafts to this address must never go out
        EmailDraft.objects.filter(
            to_email__iexact=email,
            status__in=[EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED],
        ).update(status=EmailDraft.Statuses.REJECTED, error='Recipient unsubscribed.')
    log.info('Unsubscribed %s from workspace %s', email, ws.pk)
    return _page('You are unsubscribed',
                 f'{shown} will not receive any more emails from {sender}.')
