"""One way to write and compare an e-mail address, a username and a company
name — and the words a person reads when one is already taken.

Every door that makes an account or names a company asks here first; the
database holds the same rules as unique indexes (migration 0051), so a door
that forgets, a command, the Django admin or a restored dump is stopped by
PostgreSQL itself. A clash is never resolved by code: it is for a person.
(Live, 26 Nov 2026: two super admins shared one address.)

core.models imports this module, so the models are imported here inside the
functions that look at them.
"""

TAKEN_EMAIL = 'Email already registered. Sign in instead.'
TAKEN_COMPANY = 'Company already exists. Sign in instead.'
TAKEN_USERNAME = 'That username is already taken.'


def normalize_email(value):
    """'  Ann@Acme.TEST ' → 'ann@acme.test'. Anything that is not text is no address."""
    return value.strip().lower() if isinstance(value, str) else ''


def email_is_taken(email, excluding=None):
    """Whether an account — a deleted one included, its address stays reserved
    for its 30 days — already has this address, whatever its case."""
    from .models import User
    email = normalize_email(email)
    if not email:
        return False
    qs = User.objects.filter(email__iexact=email)
    return qs.exclude(pk=excluding).exists() if excluding is not None else qs.exists()


def username_is_taken(username, excluding=None):
    """'Admin' and 'admin' are one username."""
    from .models import User
    name = username.strip() if isinstance(username, str) else ''
    if not name:
        return False
    qs = User.objects.filter(username__iexact=name)
    return qs.exclude(pk=excluding).exists() if excluding is not None else qs.exists()


def signup_address_in_use(email):
    """Whether a sign-up cannot take this address. A sign-up account's
    username IS its address, so either one being taken means it is."""
    from .models import User
    email = normalize_email(email)
    return bool(email) and (User.objects.filter(username__iexact=email).exists()
                            or email_is_taken(email))


def company_key(name):
    """'  Acme   Rockets ' → 'acme rockets': trimmed, inner spaces collapsed,
    case-folded. The workspace row keeps this as `name_key`, and it is unique."""
    return ' '.join((name or '').split()).casefold()[:200]


def company_name_is_taken(name, excluding=None):
    """Whether another company — a stopped one included, its name stays its
    own — already has this name."""
    from .models import Workspace
    key = company_key(name)
    if not key:
        return False
    qs = Workspace.all_tenants.filter(name_key=key)
    return qs.exclude(pk=excluding).exists() if excluding is not None else qs.exists()


def sync_company_name(settings_row):
    """One company, one name: the workspace row takes the name typed in
    Settings → Your business (it is what the console, the sidebar and reports
    show). Returns whether the name was free; nothing moves while it is empty
    or another company has it."""
    from .models import Workspace
    name = (settings_row.company_name or '').strip()
    ws = Workspace.all_tenants.filter(pk=settings_row.workspace_id).first()
    if ws is None or not name or company_name_is_taken(name, excluding=ws.pk):
        return False
    if ws.name != name:
        ws.name = name
        ws.save(update_fields=['name', 'name_key'])
    return True


def signup_lost_race(email, company):
    """(field, words) for a sign-up that passed its checks and then met the
    database's rule, read from what the database holds now — or None when
    neither the address nor the name is taken (then the error is not ours)."""
    if signup_address_in_use(email):
        return 'email', TAKEN_EMAIL
    if company_name_is_taken(company):
        return 'company', TAKEN_COMPANY
    return None
