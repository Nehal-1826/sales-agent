"""Change a person's role — Member, Admin, Owner or Super admin (the console).

A platform admin does this from the console (billing.views_platform.user_role).
"Super admin" is not a role value: it is an account with no workspace and
is_staff set (core.authz.is_platform_admin). Choosing it takes the account out
of its company; choosing a company role for a Super admin puts it into one.

Two things are never left behind: a company always keeps an owner (only
owners can pay) and the console always keeps a super admin. The warmup
service keeps its own copy of each person with its own role: it is told
FIRST, and when it cannot be reached nothing changes."""

from django.db import transaction
from django.utils import timezone

from . import warmup_accounts
from .authz import is_platform_admin
from .models import ImpersonationTicket, User
from .warmup_accounts import WarmupAccountsError

SUPER_ADMIN = 'super_admin'
WORKSPACE_ROLES = ('member', 'admin', 'owner')
ALL_ROLES = WORKSPACE_ROLES + (SUPER_ADMIN,)
RUNS_IT = ('owner', 'admin')          # the roles the setup wizard is written for

WORDS = {'member': 'Member', 'admin': 'Admin', 'owner': 'Owner', SUPER_ADMIN: 'Super admin'}


def label(role):
    return WORDS[role]


def role_of(user):
    """The role the console shows for an account."""
    return SUPER_ADMIN if is_platform_admin(user) else user.role


def _name(user):
    return user.get_full_name() or user.username


def _place(ws):
    return {'id': ws.pk, 'name': ws.name, 'slug': ws.slug} if ws else None


def _owners(ws, without=None):
    qs = User.objects.filter(workspace=ws, role='owner', is_active=True, deleted_at__isnull=True)
    return qs if without is None else qs.exclude(pk=without.pk)


def _another_super_admin(than):
    return User.objects.filter(workspace__isnull=True, is_staff=True, is_active=True) \
        .exclude(pk=than.pk).exists()


def _keeps_an_owner(company, without):
    """None when another owner stays; else the refusal."""
    if _owners(company, without=without).exists():
        return None
    return 'last_owner', f'{_name(without)} is the only owner of {company.name}. ' \
                         f'Make someone else owner first.', 400


def can_change(admin, target, role, workspace=None):
    """(error, detail, status) when `admin` may not make `target` `role`, else None."""
    if target is None:
        return 'not_found', 'No such account.', 404
    if role not in ALL_ROLES:
        return 'bad_role', 'Unknown role.', 400
    if target.pk == admin.pk:
        return 'cannot_change_role', 'You cannot change your own role.', 400
    if target.deleted_at is not None:
        return 'cannot_change_role', 'This account is deleted. Restore it first.', 400
    was, company = role_of(target), target.workspace
    if role == was:
        return 'already_has_role', f'This account is already {label(role).lower()}.', 400
    if SUPER_ADMIN in (role, was):
        # the role of its copy changes on the warmup side too — and two accounts
        # with one e-mail address are ONE person there, so it would change both
        twin = warmup_accounts.twin_of(target)
        if twin is not None:
            return 'shared_email', warmup_accounts.shared_email(
                target, twin, admin, 'this role cannot be changed for one of them alone.'), 400

    if role == SUPER_ADMIN:
        if not (target.email or '').strip():
            return 'no_email', 'A super admin needs an e-mail address on the account.', 400
        # it leaves its company: an owner has to stay (only owners can pay)
        return _keeps_an_owner(company, target) if company is not None else None

    # a company role
    if company is None:
        # joining one: a Super admin, or an account nobody gave a company
        if workspace is None:
            return 'workspace_required', 'Choose the company this account joins.', 400
        if not workspace.is_active:
            return 'workspace_stopped', f'{workspace.name} is stopped.', 400
        if was == SUPER_ADMIN and not _another_super_admin(target):
            return 'last_super_admin', 'At least one super admin must remain.', 400
        from billing.entitlements import BillingError, check, has_paid_access
        if has_paid_access(workspace):
            try:
                check(workspace, 'seats', add=1)
            except BillingError:
                return 'seat_limit', f'The {workspace.name} plan has no seat left.', 400
        return None
    # inside the same company: an owner has to stay
    if was == 'owner':
        return _keeps_an_owner(company, target)
    if was == 'admin' and role == 'member' and not _owners(company).exists():
        return 'last_owner', f'Nobody would be left to run {company.name}. ' \
                             f'Make someone else owner first.', 400
    return None


def _onboarding(target, workspace):
    """The onboarding state to store when the account becomes an Owner or an
    Admin. A set-up company's wizard is not theirs to finish — its finish
    switches the company's autopilot on or off — so they are marked done. A
    company that is not set up yet is left alone: somebody has to."""
    from .models import AppSettings
    set_up = AppSettings.all_tenants.filter(workspace=workspace).exclude(company_name='').exists()
    if not set_up:
        return target.onboarding
    return {**(target.onboarding or {}), 'done': True}


def change_role(admin, target, role, reason=None, workspace=None, ip=None):
    """Make `target` `role`. Returns {'from', 'to', 'workspace_left', 'workspace_joined'}."""
    was, left = role_of(target), target.workspace
    joins = role != SUPER_ADMIN and left is None       # a company is joined only from outside
    home = workspace if joins else left                # where the account is afterwards
    email = target.email or ''
    now = timezone.now()

    # 1. the warmup service first: when it cannot answer, nothing below runs.
    #    Each way is two steps there; when the second fails the first is taken
    #    back (warmup_accounts.undo), so that "Nothing was changed" is true.
    if role == SUPER_ADMIN:
        warmup_accounts.set_paused(email, admin, True)        # while its copy is still a client
        try:
            warmup_accounts.set_role(email, admin, 'super_admin')
        except WarmupAccountsError:
            warmup_accounts.undo(
                warmup_accounts.set_paused, (email, admin, False),
                "The role was not changed, but the warmup service could not finish its part: "
                "this account's warmup mailboxes are paused. Try again in a moment.")
            raise
    elif was == SUPER_ADMIN:
        warmup_accounts.set_role(email, admin, 'client')
        try:
            warmup_accounts.set_paused(email, admin, False)  # what the promotion paused runs again
        except WarmupAccountsError:
            warmup_accounts.undo(
                warmup_accounts.set_role, (email, admin, 'super_admin'),
                'The role was not changed, but the warmup service could not finish its part: '
                'on the warmup side this account is no longer a super admin. Try again in a moment.')
            raise

    # 2. the account — plain UPDATEs: save() would re-attach the active workspace
    if role == SUPER_ADMIN:
        with transaction.atomic():
            User.objects.filter(pk=target.pk).update(workspace=None, is_staff=True)
            # an admin who is inside as this person is out with it
            ImpersonationTicket.objects.filter(target=target, ended_at__isnull=True).update(ended_at=now)
    else:
        # `home`, never the request's company: a change inside a company must leave the person in it
        fields = {'workspace': home, 'role': role, 'is_staff': False, 'is_superuser': False}
        if role in RUNS_IT:
            fields['onboarding'] = _onboarding(target, home)
        with transaction.atomic():
            User.objects.filter(pk=target.pk).update(**fields)

    # 3. the record
    from billing.payments import audit
    out = {'from': was, 'to': role,
           'workspace_left': _place(left) if role == SUPER_ADMIN else None,
           'workspace_joined': _place(home) if joins else None}
    audit('platform.user.role', home, {
        'target_user_id': target.pk, 'target_email': target.email, 'target_username': target.username,
        'from': was, 'to': role, 'reason': reason, **out}, actor=admin, ip=ip)
    return out
