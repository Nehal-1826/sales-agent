"""Delete an account, bring it back, remove it for good (a 30-day recycle bin).

A platform admin deletes a customer's account from the console
(billing.views_platform.user_delete). Nothing is removed on the spot: the
account is marked deleted and cannot sign in from that moment, and it can be
brought back for KEEP_DAYS days. After that it is removed for good
(purge_deleted, run once a day by the agent worker).

The workspace stops with its last owner or admin — a workspace nobody can
enter must not keep finding leads and sending e-mail — and the accounts
still in it go with it. What stops sign-in and the worker is the existing
`is_active = False`: both already skip what is not active."""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.authtoken.models import Token

from . import warmup_accounts
from .authz import DELETED_DETAIL, is_platform_admin
from .models import ImpersonationTicket, User, Workspace
from .warmup_accounts import WarmupAccountsError

log = logging.getLogger(__name__)

KEEP_DAYS = 30          # a deleted account can be brought back for this long
RUNS_IT = ('owner', 'admin')   # while the workspace has one of these, it keeps running


def purge_date(deleted_at):
    """When a deleted account is removed for good."""
    return deleted_at + timedelta(days=KEEP_DAYS) if deleted_at else None


def can_delete(admin, target):
    """(error, detail, status) when `admin` may not delete `target`, else None."""
    if target is None:
        return 'not_found', 'No such account.', 404
    if is_platform_admin(target):
        return 'cannot_delete', 'Super admin accounts cannot be deleted here.', 400
    if target.pk == admin.pk:
        return 'cannot_delete', 'You cannot delete your own account.', 400
    if target.workspace is None:
        return 'cannot_delete', 'This account has no workspace.', 400
    if target.deleted_at is not None:
        return 'already_deleted', 'This account is already deleted.', 400
    # what stops its warmup mailboxes is its COPY on the warmup side, and two
    # accounts with one e-mail address have the same copy: the other one's
    # mailboxes would stop too
    twin = warmup_accounts.twin_of(target)
    if twin is not None:
        return 'shared_email', warmup_accounts.shared_email(
            target, twin, admin,
            "deleting this account would stop the other one's warmup mailboxes too."), 400
    return None


def _audit(action, admin, ws, meta, ip=None):
    from billing.payments import audit          # billing reads core models: imported here, not above
    audit(action, ws, meta, actor=admin, ip=ip)


def _who_keeps_it_running(ws, without):
    """The owners and admins of `ws`, other than `without`, that are neither
    deleted nor switched off. While there is one, the workspace keeps running."""
    return User.objects.filter(workspace=ws, role__in=RUNS_IT, is_active=True,
                               deleted_at__isnull=True).exclude(pk=without.pk)


def _mark_deleted(user, admin, now):
    User.objects.filter(pk=user.pk).update(deleted_at=now, deleted_by=admin, is_active=False)
    # no session survives the deletion (a token takes its sessions with it)
    Token.objects.filter(user=user).delete()
    # an admin who is inside the workspace as this person is out with it
    ImpersonationTicket.objects.filter(target=user, ended_at__isnull=True).update(ended_at=now)


def delete_account(admin, target, reason=None, ip=None):
    """Delete `target`. Returns {'workspace_stopped': bool, 'deleted_accounts': [usernames]}."""
    ws = target.workspace
    stopped = not _who_keeps_it_running(ws, target).exists()
    going = [target]
    if stopped:
        # the accounts still inside could never sign in to a stopped workspace,
        # and the workspace could never be removed for good while they waited
        going += list(User.objects.filter(workspace=ws, deleted_at__isnull=True).exclude(pk=target.pk))
    # 1. the warmup mailboxes first: a deleted account must never keep warming,
    #    so a service that cannot pause them stops the whole deletion here,
    #    before one row is touched
    paused = []
    try:
        for user in going:
            warmup_accounts.set_paused(user.email, admin, True)
            paused.append(user)
    except WarmupAccountsError:
        # nothing is deleted, so what was paused runs again. Every one of them
        # is tried; those that cannot are named to the admin — never "Nothing
        # was changed" while some mailboxes stayed paused.
        stayed = []
        for user in paused:
            try:
                warmup_accounts.set_paused(user.email, admin, False)
            except WarmupAccountsError:
                stayed.append(user.username)
        if stayed:
            log.error('a deletion was refused and the warmup mailboxes of %s stayed paused', ', '.join(stayed))
            raise WarmupAccountsError(
                'No account was deleted, but the warmup service could not finish its part: the warmup '
                f'mailboxes of {", ".join(stayed)} are paused. Try again in a moment.', 502, unchanged=False)
        raise
    # 2. the accounts — and the workspace with its last owner or admin
    now = timezone.now()
    with transaction.atomic():
        for user in going:
            _mark_deleted(user, admin, now)
        if stopped:
            # Only a workspace the DELETION stops is stamped. One an admin had
            # stopped by hand (Tenants) stays exactly that: a restore later
            # must never undo a decision the admin made themselves.
            Workspace.all_tenants.filter(pk=ws.pk, is_active=True).update(deleted_at=now, is_active=False)
    _audit('platform.user.delete', admin, ws,
           {'target_user_id': target.pk, 'target_email': target.email,
            'target_username': target.username, 'reason': reason,
            'workspace_stopped': stopped, 'deleted_accounts': [u.username for u in going]}, ip)
    return {'workspace_stopped': stopped, 'deleted_accounts': [u.username for u in going]}


def restore_account(admin, target, reason=None, ip=None):
    """Bring a deleted `target` back. Returns {'workspace_started': bool}."""
    ws = target.workspace
    # 1. its warmup mailboxes may run again — a service that cannot say so
    #    leaves everything exactly as it was
    warmup_accounts.set_paused(target.email, admin, False)
    # 2. the account; and the rule that stops a workspace, read backwards: a
    #    workspace stopped by a deletion runs again once someone who can run
    #    it is back. (One stopped by hand from Tenants stays stopped.)
    started = bool(not ws.is_active and ws.deleted_at is not None and target.role in RUNS_IT)
    with transaction.atomic():
        User.objects.filter(pk=target.pk).update(deleted_at=None, deleted_by=None, is_active=True)
        if started:
            Workspace.all_tenants.filter(pk=ws.pk).update(is_active=True, deleted_at=None)
    _audit('platform.user.restore', admin, ws,
           {'target_user_id': target.pk, 'target_email': target.email,
            'target_username': target.username, 'reason': reason,
            'workspace_started': started}, ip)
    return {'workspace_started': started}


# ------------------------------------------------------------------ for good
def workspace_models():
    """Every model whose rows belong to one workspace — except the billing
    rows (Subscription, Invoice, Payment, Refund), which outlive the account.
    Read from the app, so a model added later is covered without a change here."""
    from django.apps import apps
    from .tenancy import TenantOwned
    return [m for m in apps.get_models()
            if issubclass(m, TenantOwned) and m._meta.app_label != 'billing']


def _forget_warmup(user):
    """Remove the account's warmup copy before its rows go.
    'gone' | 'kept' (nobody is left to sign the call: left, and logged with
    its e-mail) | 'failed' (the service could not: the account waits)."""
    admin = user.deleted_by
    if admin is None or not is_platform_admin(admin):
        log.warning('purge: the warmup copy of %s is left — the admin who deleted the account is gone. '
                    'Remove it by hand on the warmup side.', user.email)
        return 'kept'
    try:
        warmup_accounts.remove(user.email, admin)
    except WarmupAccountsError as exc:
        log.warning('purge: the account %s stays for the next day — the warmup service could not '
                    'remove the copy of %s (%s)', user.username, user.email, exc.detail)
        return 'failed'
    return 'gone'


def _purge_workspace(ws, users, now):
    """Remove every row of a stopped workspace and its accounts. The workspace
    row stays — the billing rows point at it and the audit log names it — and
    so does every billing row."""
    from billing.models import Subscription
    removed = {}
    with transaction.atomic():
        for model in workspace_models():
            removed[model.__name__] = model.all_tenants.filter(workspace=ws).delete()[0]
        User.objects.filter(workspace=ws).delete()       # tokens, sessions and tickets go with them
        Workspace.all_tenants.filter(pk=ws.pk).update(name=f'Deleted account {ws.pk}', is_active=False)
        # Never through the owner's own cancel (billing.payments.cancel_subscription):
        # that refunds money and asks the gateway. A renewal the gateway
        # manages itself has to be cancelled there by hand.
        Subscription.all_tenants.filter(workspace=ws, status=Subscription.Statuses.ACTIVE).update(
            status=Subscription.Statuses.CANCELED, canceled_at=now)
    return removed


def _has_rows(ws):
    """Whether anything of the workspace is still here."""
    return User.objects.filter(workspace=ws).exists() or any(
        m.all_tenants.filter(workspace=ws).exists() for m in workspace_models())


def purge_deleted(days=KEEP_DAYS, dry_run=False, now=None):
    """Remove for good what has been deleted for `days` days or longer.

    Returns {'workspaces': [{'slug', 'users'}], 'users': [e-mails], 'kept': [e-mails]}:
    what went (dry: what would go), and whose warmup copy made it wait."""
    now = now or timezone.now()
    cutoff = now - timedelta(days=days)
    gone = {'workspaces': [], 'users': [], 'kept': []}

    # 1. A workspace that is stopped goes with everything in it once nobody in
    #    it can be brought back — together, so nobody is restored into a
    #    workspace that could never start again. Only while something of it
    #    is still here: one that was removed already is never touched again.
    for ws in Workspace.all_tenants.filter(is_active=False).order_by('id'):
        users = list(User.objects.select_related('deleted_by').filter(workspace=ws))
        if any(u.deleted_at is None or u.deleted_at > cutoff for u in users):
            continue
        if not users and not _has_rows(ws):
            continue
        plan = {'slug': ws.slug, 'users': [u.email for u in users]}
        if dry_run:
            gone['workspaces'].append(plan)
            continue
        if 'failed' in [_forget_warmup(u) for u in users]:
            gone['kept'] += plan['users']
            continue
        removed = _purge_workspace(ws, users, now)
        gone['workspaces'].append(plan)
        _audit('platform.user.purge', None, ws, {**plan, 'removed': removed})

    # 2. A deleted account of a workspace that is not stopped by a deletion
    #    goes on its own. (The accounts of one that is went with it above —
    #    or are waiting for it.)
    old = [u for u in User.objects.select_related('workspace').filter(deleted_at__lte=cutoff).order_by('id')
           if u.workspace is None or u.workspace.deleted_at is None]
    for user in old:
        if dry_run:
            gone['users'].append(user.email)
            continue
        if _forget_warmup(user) == 'failed':
            gone['kept'].append(user.email)
            continue
        ws, email = user.workspace, user.email
        User.objects.filter(pk=user.pk).delete()
        gone['users'].append(email)
        _audit('platform.user.purge', None, ws, {'users': [email], 'removed': {'User': 1}})
    return gone
