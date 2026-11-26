# Indian Format by Default, Changeable Anytime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every date, time, number and amount on screen follows one saved choice per person — India and the 12-hour clock by default, switchable to the United States, the UK or "match my device" — and every document (invoice, report e-mail, digest) is always in Indian format.

**Architecture:** One module in the app (`frontend/src/lib/format.ts`) formats everything on screen and holds the person's choice, loaded from the profile before the first screen draws; one module on each backend (`core/formatting.py`, `app/services/formatting.py`) formats documents, fixed to India. The choice lives on the account (`User.format`, `User.clock`), so it covers both the console and the workspace app.

**Tech Stack:** Django + DRF (migration 0050), FastAPI (warmup service), React + TypeScript (`Intl`), Playwright.

Spec: `docs/superpowers/specs/2026-11-26-indian-format-design.md`.

## Global Constraints

- India and the 12-hour clock are the default for every existing and new account.
- Formats: `IN` (India) · `US` (United States) · `GB` (UK) · `device` (match my device). Clock: `12h` · `24h`.
- The sign of an amount follows the money (₹ for INR, `$` for USD); only its grouping follows the format.
- Inputs stay as they are (hours typed as 24-hour text, date pickers); exports keep ISO dates in their cells; the public pricing page is unchanged.
- Documents are always Indian, for everyone: dates `26/11/2026`, dates and times `26/11/2026, 2:05 PM IST`, money `₹2,999.00` with Indian grouping.
- No new dependencies. Portable code only: no `%-d`/`%-I` in `strftime` (they do not exist on Windows).
- Plain, everyday words in every message. No push, no deploy.

## Contract

| Call | Body | Answer |
|------|------|--------|
| `GET /api/auth/me/` | — | adds `preferences {format: 'IN'\|'US'\|'GB'\|'device', clock: '12h'\|'24h'}` |
| `PUT /api/auth/preferences/` | `{format?, clock?}` — only the keys sent change | 200 `{format, clock}`; 400 `{detail}` for an unknown value; 403 inside "Enter as user" |

The one formatter (`frontend/src/lib/format.ts`):

```ts
export type FormatPreset = 'IN' | 'US' | 'GB' | 'device';
export type Clock = '12h' | '24h';
export interface Preferences { format: FormatPreset; clock: Clock }
export const FORMAT_LABELS: Record<FormatPreset, string>;   // India · United States · UK · Match my device
export const CLOCK_LABELS: Record<Clock, string>;           // 12-hour (2:05 PM) · 24-hour (14:05)
export const DEFAULT_PREFERENCES: Preferences;
export function getPreferences(): Preferences;
export function setPreferences(next: Partial<Preferences> | null | undefined): void;   // only the keys given change
export function usePreferences(): Preferences;                                    // re-renders on a change
export function fmtDate(d, style: 'short' | 'medium' = 'short'): string;            // 26/11/2026 · 26 Nov 2026
export function fmtTime(d): string;                                               // 2:05 PM
export function fmtDateTime(d): string;                                           // 26/11/2026, 2:05 PM
export function fmtDayTick(d, withYear = false): string;                          // 12 Nov · 12 Nov 2025 (chart axes)
export function fmtNumber(n, digits?: number): string;                            // 1,00,000
export function fmtMoney(minor: number, currency: string): string;                 // minor units → ₹2,999.00
export function fmtMoneyMajor(major: number, currency: string, digits = 2): string;// whole units → $39.00
export function fmtPercent(n, digits = 0): string;                                 // 72%
```
(`d` is a `Date`, an ISO string, a number or null/undefined; a missing value gives `''`.)
`timeAgo`, `elapsedClock`, `plural`, `greeting` stay in the same file.

---

### Task 1 (Django): the two fields, the profile, the endpoint

**Files:** Modify `backend-agent/core/models.py` (`User`), new migration `0050_user_format_clock.py`, `backend-agent/core/views.py` (`_me_payload`, `preferences`), `backend-agent/core/urls.py`, `backend-agent/core/impersonation.py` (`REFUSED_PREFIXES`). Tests: `backend-agent/core/tests/test_preferences.py`.

- [x] **Step 1: Write the failing tests**

```python
"""A person's format choice (User.format, User.clock): India and the 12-hour
clock by default, carried by the profile, changed through one endpoint — and
never from inside "Enter as user" (it is the person's own setting)."""

from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_platform_base import make_admin
from core.models import ImpersonationTicket, User
from core.tests.base import TenantTestCase

REFUSED = 'Not available while you are inside as another user.'


def signed_in(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
    return c


class DefaultTests(TenantTestCase):
    def setUp(self):
        self.u = User.objects.create_user(workspace=self.workspace, username='ada', password='pass12345', role='member')

    def test_everyone_starts_on_india_and_the_12_hour_clock(self):
        self.assertEqual((self.u.format, self.u.clock), ('IN', '12h'))

    def test_the_profile_carries_them(self):
        r = signed_in(self.u).get('/api/auth/me/')
        self.assertEqual(r.json()['preferences'], {'format': 'IN', 'clock': '12h'})

    def test_a_person_changes_their_own(self):
        c = signed_in(self.u)
        r = c.put('/api/auth/preferences/', {'format': 'US'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'format': 'US', 'clock': '12h'}), r.content)
        self.assertEqual(c.get('/api/auth/me/').json()['preferences'], {'format': 'US', 'clock': '12h'})
        r = c.put('/api/auth/preferences/', {'format': 'device', 'clock': '24h'}, format='json')
        self.assertEqual(r.json(), {'format': 'device', 'clock': '24h'})
        self.assertEqual(c.get('/api/auth/me/').json()['preferences'], {'format': 'device', 'clock': '24h'})

    def test_an_unknown_value_is_refused_and_changes_nothing(self):
        c = signed_in(self.u)
        for body in ({'format': 'EU'}, {'clock': '48h'}, {'format': 12}):
            r = c.put('/api/auth/preferences/', body, format='json')
            self.assertEqual(r.status_code, 400, r.content)
        self.u.refresh_from_db()
        self.assertEqual((self.u.format, self.u.clock), ('IN', '12h'))

    def test_nobody_signed_in(self):
        self.assertEqual(APIClient().put('/api/auth/preferences/', {'format': 'US'}, format='json').status_code, 401)


class ConsoleTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.admin, self.admin_u, _ = make_admin()

    def test_a_super_admin_changes_theirs_too(self):
        r = self.admin.put('/api/auth/preferences/', {'format': 'GB'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'format': 'GB', 'clock': '12h'}), r.content)
        self.assertEqual(self.admin.get('/api/auth/me/').json()['preferences']['format'], 'GB')


class InsideTests(TenantTestCase):
    def test_it_cannot_be_changed_from_inside_enter_as_user(self):
        target = User.objects.create_user(workspace=self.workspace, username='t', password='pass12345', role='owner')
        admin, admin_u, _ = make_admin()
        now = timezone.now()
        ImpersonationTicket.objects.create(key_hash='k' * 64, admin=admin_u, target=target, workspace=self.workspace,
                                           reason='helping', started_at=now, ends_at=now + timedelta(minutes=30))
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Impersonation k')
        r = c.put('/api/auth/preferences/', {'format': 'US'}, format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (403, REFUSED))
```

- [x] **Step 2: Run → fail** — `manage.py test core.tests.test_preferences` (`FieldError: format` / 404).
- [x] **Step 3: The fields** — in `core/models.py`, inside `User`, after `Roles`:

```python
    class Formats(models.TextChoices):
        INDIA = 'IN', 'India'
        US = 'US', 'United States'
        UK = 'GB', 'UK'
        DEVICE = 'device', 'Match my device'

    class Clocks(models.TextChoices):
        H12 = '12h', '12-hour'
        H24 = '24h', '24-hour'
```

  and after `deleted_by`:

```python
    # how this person reads dates, numbers and times ON SCREEN (the app's
    # lib/format.ts reads them). Documents are always Indian (core.formatting).
    format = models.CharField(max_length=8, choices=Formats.choices, default=Formats.INDIA)
    clock = models.CharField(max_length=4, choices=Clocks.choices, default=Clocks.H12)
```

  `manage.py makemigrations core -n user_format_clock` (with `DATABASE_URL=sqlite:///db-agent-e2e.sqlite3`).
- [x] **Step 4: The profile and the endpoint** — `core/views.py`: in `_me_payload` add
  `data['preferences'] = {'format': user.format, 'clock': user.clock}`; add

```python
@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
def preferences(request):
    """How this person reads dates, numbers and times on screen (the app's
    lib/format.ts). Only the keys sent change; an unknown value is refused."""
    body = request.data if hasattr(request.data, 'get') else {}
    changes = {}
    for field, allowed in (('format', set(User.Formats.values)), ('clock', set(User.Clocks.values))):
        value = body.get(field)
        if value is None:
            continue
        if value not in allowed:
            return Response({'detail': f'Unknown {field}.'}, status=400)
        changes[field] = value
    if changes:
        User.objects.filter(pk=request.user.pk).update(**changes)     # the request's user object is stale after this
    fresh = User.objects.get(pk=request.user.pk)
    return Response({'format': fresh.format, 'clock': fresh.clock})
```

  `core/urls.py`: `path('auth/preferences/', views.preferences, name='preferences')`.
  `core/impersonation.py`: `REFUSED_PREFIXES` gains `'/api/auth/preferences/'`.
- [x] **Step 5: Run → pass** (`from django.utils import timezone` is needed by the test).

### Task 2 (Django): documents are always Indian

**Files:** Create `backend-agent/core/formatting.py`. Modify `backend-agent/billing/views.py` (`money`, `invoice_context`), `backend-agent/billing/templates/billing/invoice.html`, `backend-agent/core/reports.py` (labels 128/133/155), `backend-agent/core/inbox.py:680`, `backend-agent/core/management/commands/send_slug_report.py:74`, `backend-agent/core/outbox.py:524-526`. Tests: `backend-agent/core/tests/test_formatting.py`, plus the tests that pin the old labels.

- [x] **Step 1: Write the failing tests** — `core/tests/test_formatting.py`:

```python
"""Indian formats for documents (core.formatting): lakhs and crores, day-first
dates, 12-hour times, Indian time — the same for everyone who reads them."""
from datetime import datetime, timezone as utc

from django.test import SimpleTestCase

from core import formatting

AT = lambda h, m=0: datetime(2026, 11, 26, h, m, tzinfo=utc)      # noqa: E731


class NumberTests(SimpleTestCase):
    def test_lakhs_and_crores(self):
        self.assertEqual([formatting.number(n) for n in (999, 1000, 99999, 100000, 1234567, 10000000)],
                         ['999', '1,000', '99,999', '1,00,000', '12,34,567', '1,00,00,000'])

    def test_decimals_and_negatives(self):
        self.assertEqual(formatting.number(1234.5), '1,234.5')
        self.assertEqual(formatting.number(-150000), '-1,50,000')


class MoneyTests(SimpleTestCase):
    def test_rupees_with_indian_grouping(self):
        self.assertEqual(formatting.money(299900, 'INR'), '₹2,999.00')
        self.assertEqual(formatting.money(10000000, 'INR'), '₹1,00,000.00')

    def test_dollars_keep_their_sign(self):
        self.assertEqual(formatting.money(3900, 'USD'), '$39.00')
        self.assertEqual(formatting.money(-500, 'INR'), '-₹5.00')
        self.assertEqual(formatting.money(49900, 'EUR'), 'EUR 499.00')


class DateTests(SimpleTestCase):
    def test_day_first_in_indian_time(self):
        self.assertEqual(formatting.date(AT(10, 30)), '26/11/2026')
        self.assertEqual(formatting.date(AT(18, 30)), '27/11/2026')       # midnight has passed in India

    def test_dates_and_times(self):
        self.assertEqual(formatting.datetime_label(AT(8, 35)), '26/11/2026, 2:05 PM IST')
        self.assertEqual(formatting.datetime_label(AT(14, 5)), '26/11/2026, 7:35 PM IST')
        self.assertEqual(formatting.datetime_label(AT(0, 5)), '26/11/2026, 6:05 AM IST')

    def test_short_forms(self):
        self.assertEqual(formatting.day_month(AT(10)), '26/11')
        self.assertEqual(formatting.clock(AT(8, 35)), '2:05 PM')

    def test_nothing_is_nothing(self):
        self.assertEqual((formatting.date(None), formatting.datetime_label(None), formatting.money(0, 'INR')),
                         ('', '', '₹0.00'))
```

  plus, in `billing/tests/test_invoices_api.py`, one test that the tenant's invoice HTML has `₹` and a `26/11/2026`-style date and no `Rs.`; and the tests that pin the old report labels change to the new ones (`test_daily_report_catchup.py`: titles end with `Lead report — 24/11/2026, 8:00 PM IST – 25/11/2026, 8:00 PM IST` and `Lead report — 25/11/2026 (IST)`).
- [x] **Step 2: Run → fail.**
- [x] **Step 3: `core/formatting.py`** (full code):

```python
"""Indian formats for everything a person reads OFF a screen — invoices,
reports, digests, e-mails.

Fixed on purpose: a document goes to whoever reads it, often more than one
person, so it cannot follow one person's choice. On screens the app follows
the person's own choice instead (lib/format.ts, User.format / User.clock).
Portable code only: no `%-d` in strftime (it does not exist on Windows)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from django.utils import timezone

IST = ZoneInfo('Asia/Kolkata')
SYMBOLS = {'INR': '₹', 'USD': '$'}


def indian_grouping(digits):
    """'100000' → '1,00,000', '1234567' → '12,34,567' — lakhs and crores."""
    if len(digits) <= 3:
        return digits
    head, parts = digits[:-3], [digits[-3:]]
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ','.join([head, *parts]) if head else ','.join(parts)


def number(n):
    """A number with Indian grouping ('1,00,000', '1,234.5', '-1,50,000')."""
    text = f'{n:f}' if isinstance(n, float) else str(n)
    sign = '-' if text.startswith('-') else ''
    whole, dot, rest = text.lstrip('-').partition('.')
    return sign + indian_grouping(whole) + (dot + rest if dot else '')


def money(minor, currency):
    """An amount in minor units: '₹2,999.00', '$39.00', 'EUR 499.00'."""
    sign = '-' if minor < 0 else ''
    minor = abs(int(minor))
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(str(minor // 100))}.{minor % 100:02d}"


def money_major(major, currency, digits=2):
    """An amount in whole units, already rounded: '₹499', '₹1,234.00'."""
    sign = '-' if major < 0 else ''
    text = f'{abs(major):.{digits}f}'
    whole, dot, rest = text.partition('.')
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(whole)}{dot}{rest}"


def in_india(value):
    """A datetime in Indian time; a naive one is taken as UTC."""
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return value.astimezone(IST)


def date(value):
    """'26/11/2026'."""
    moment = in_india(value)
    return f'{moment:%d/%m/%Y}' if moment else ''


def day_month(value):
    """'26/11'."""
    moment = in_india(value)
    return f'{moment:%d/%m}' if moment else ''


def clock(value):
    """'2:05 PM'."""
    moment = in_india(value)
    if not moment:
        return ''
    hour = f'{moment:%I}'.lstrip('0') or '12'
    return f'{hour}:{moment:%M} {moment:%p}'


def datetime_label(value):
    """'26/11/2026, 2:05 PM IST'."""
    moment = in_india(value)
    return f'{date(moment)}, {clock(moment)} IST' if moment else ''
```

- [x] **Step 4: Use it** —
  - `billing/views.py`: `money()` becomes `from core.formatting import money` (delete the local one); `invoice_context` adds `'issued': formatting.date(inv.issued_at), 'period_start': formatting.date(inv.period_start), 'period_end': formatting.date(inv.period_end)`; the template uses `{{ issued }}`, `{{ period_start }}`, `{{ period_end }}` instead of the `|date:"j M Y"` filters.
  - `core/reports.py`: line 128 `label = f'{formatting.datetime_label(start)} – {formatting.datetime_label(end)}'`; line 133 `label = formatting.date(day)`; line 155 keeps `' (IST)'` for a day.
  - `core/inbox.py:680`: `when = formatting.day_month(r.received_at) if r.received_at else ''`.
  - `send_slug_report.py:74`: `ts = formatting.datetime_label(a.created_at)`.
  - `core/outbox.py:524-526`: `day = '' if when.date() == today else f' on {when:%a}, {when:%d/%m/%Y}'` and `at about {formatting.clock(when)}{day} (IST)` (`when` there is already IST-local).
- [x] **Step 5: Run → pass** — the new tests, `test_daily_report_catchup`, `test_invoices_api`, and every suite that mentions `goes out at about`.

### Task 3 (warmup service): its documents

**Files:** Create `backend/app/services/formatting.py` (the same helpers without Django: `in_india` takes a `datetime`, naive = UTC). Modify `backend/app/services/payments_service.py:1129-1144`, `transactional_mail.py:505,551`, `admin_reports_service.py:294,583`, `reports_service.py:679`. Tests: `backend/tests/test_formatting.py`.

- [x] Tests first (the same cases as Task 2, plus `money_major(499.0, 'INR', 0) == '₹499'` and `money_major(1234.0, 'INR') == '₹1,234.00'`), run red, then: the invoice PDF says `Issued 26/11/2026` and `₹499.00` through the helpers; mails `money_major(amount_cents / 100, 'INR', 0)`; report summaries `money_major(x, 'INR')`; the stamp `Generated {formatting.datetime_label(datetime.now(UTC))}`.

### Task 4 (app): the one formatter, the card, the dialog, the ways in

**Files:** Rewrite `frontend/src/lib/format.ts`. Modify `frontend/src/lib/endpoints.ts` (`getCurrentUser` calls `setPreferences`), `frontend/src/lib/platform.ts` (`getMe` too; `savePreferences`), `frontend/src/lib/transport.ts` (`startImpersonation`'s callers), `frontend/src/pages/ImpersonatePage.tsx` (`setPreferences(profile.preferences)` on start and resume). Create `frontend/src/components/FormatCard.tsx`, `frontend/src/components/FormatDialog.tsx`. Modify `frontend/src/components/Sidebar.tsx` and `frontend/src/pages/platform/PlatformShell.tsx` (a **Format** button in each foot).

- [x] `lib/format.ts` (full code, as in the contract; `useSyncExternalStore`; AM/PM in capitals for every format).
- [x] `lib/platform.ts`: `Me` gains `preferences?: Preferences`; `getMe()` → `setPreferences(me.preferences)` before returning; `savePreferences(body): Promise<Result<Preferences>>` → `attempt(() => request('/auth/preferences/', { method: 'PUT', body: JSON.stringify(body) }))`.
- [x] `lib/endpoints.ts`: `getCurrentUser()` → `setPreferences(me.preferences)` after the request.
- [x] `ImpersonatePage.tsx`: after a successful `startImpersonation` and in `resume` → `setPreferences(profile.preferences)`.
- [x] `FormatCard.tsx`: two `<select>`s (`aria-label="Format"`, `aria-label="Clock"`) and **Save format** (`btn btn-primary`); saves only what changed; toast `Format saved.`; on a refusal the server's words. Used by itself (the dialog) and inside the two Settings pages.
- [x] `FormatDialog.tsx`: `Modal` title **"Format"** (`aria-label="Format"`), the card inside, no footer of its own.
- [x] `Sidebar.tsx` foot: a small button **Format** (`aria-label="Format"`, showing the current choice, e.g. "India · 12-hour") above the sign-out row, opening the dialog. Same in `PlatformShell.tsx`'s foot.
- [x] `npx tsc --noEmit -p .` passes.

### Task 5 (app): every screen goes through the formatter

Three parallel sweeps on disjoint folders (the formatter from Task 4 is the contract; the old helpers are deleted, not left beside it):

- **Warmup pages** — `pages/warmup/chartTheme.ts` (`formatDayTick` → `fmtDayTick`), `Reports.tsx` (nine `toLocaleString`, ISO range dates shown as text), `Reputation.tsx`, `WarmthHero.tsx`, `DnsWizard.tsx`, `MailboxActions.tsx` (`when`, `hourLabel`, the raw timezone line), `MailboxRows.tsx`, the four charts; `lib/warmupReport.ts` (`fmtInt`, `pct`, the "Generated" date, ISO range dates).
- **Console pages** — `pages/platform/`: `accountUi.tsx` (`when`, `fmtRelative` → `timeAgo`), `AdminBillingPage.tsx` (dates, numbers, the literal `$`), `AdminReportsPage.tsx`, `PaymentsPage.tsx`, `InvoicesPage.tsx`, `TenantsPage.tsx`, `PeerInboxesPage.tsx` (`fmtLastUsed`), `CrmManagementPage.tsx` (`relativeTime`, compact "1.2k"), `MailViewerPage.tsx` (`fmtDate`), `PlatformAnalyticsPage.tsx` (`nf`, `usd`), `UserDrawer.tsx` (the literal `$`), `AdminSettingsPage.tsx` (the literal `$`), `PoolRoutingPage.tsx`, `AdminUsersPage.tsx`, `Bars.tsx`; and in `AdminSettingsPage.tsx` the **Format** card (the shared `FormatCard`) near the top. `PlatformShell.tsx` is NOT touched here.
- **Workspace and shared** — `pages/mail/helpers.ts` (`shortDate`, `fullDate`), `components/draftUtils.tsx` (`sendTimeLabel`), `components/LeadDrawer.tsx`, `components/TwoFactorPanel.tsx`, `components/ImpersonationBanner.tsx` (`clock`), `pages/RepliesPage.tsx`, `pages/ChatPage.tsx`, `pages/settings/BillingSection.tsx` (`fmtDate`), `BillingParts.tsx`, `MailboxesSection.tsx` (`when`, `hourLabel`), `WhatsAppSection.tsx`; and in `pages/settings/AccountSection.tsx` the **Format** card. `Sidebar.tsx` is NOT touched here.

Rules given to every sweep: a time of day on a screen uses `fmtTime`; a chart's hours use `fmtTime`; a place where the person TYPES 24-hour text is an input and stays; `toFixed` on scores and percentages stays (the decimal point is the same everywhere); the four relative-time helpers become `timeAgo` (callers keep their own "Never"); nothing may call `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` / `new Intl.NumberFormat` / `new Intl.DateTimeFormat` outside `lib/format.ts`.

### Task 6: the gate — a guard and a walk

- [x] **The guard (red until the sweeps are done):** in `scripts/e2e/flow.py`, a check that searches `frontend/src` for `toLocaleDateString(`, `toLocaleTimeString(`, `.toLocaleString(`, `new Intl.NumberFormat(`, `new Intl.DateTimeFormat(` outside `frontend/src/lib/format.ts`, `frontend/src/marketing/` and lines containing `resolvedOptions()` — and fails listing the files.
- [x] **The walk:** in the console walk, the rail's **Format** button opens the dialog; the Users table's "Signed up" cell for a known account reads `05/11/2026`-style under India; choosing **United States** and saving flips it to `11/05/2026`; a reload keeps it; choosing **India** puts it back. In the workspace walk, a throwaway Member (made by `django_shell`, removed in the end) signs in and opens the same dialog from the sidebar.
- [x] `manage.py test` · the warmup pytest gate · `npm run build` · `python scripts/e2e/flow.py` — all green; secret scan; one commit; `AGENTS.md`.

## As built (26 Nov 2026)

Everything above is in. What differs from the plan, and why:

- **`FormatScope`** (new, `components/FormatScope.tsx`) — a saved change must re-draw every open screen. The choice lives in the module, so the screen that is already open changes only when React draws it again: `FormatScope` watches the choice and calls its children again (a render-prop inside `<main>` in both shells — nothing remounts, no page has to subscribe).
- **`FormatDialog` goes through a portal** (`createPortal(…, document.body)`): the sidebar is a `backdrop-filter` panel, and such a panel is the box its fixed-position children are placed against — inside the rail the dialog was squeezed into it.
- The formatter learned two things the sweeps found: **a bare day is a calendar label** (`"2026-11-26"` is that day wherever the device is — `new Date` read it as UTC midnight, the day before west of Greenwich), and **`fmtMonth`** ("Nov 2026") for the Overview's month axis. The 24-hour clock writes its leading zero in every format; `timeAgo` goes on to months and years; `plural` groups its count.
- The sidebar's entry is a **label of the current choice** ("India · 12-hour"), not a bare "Format" — the person sees at a glance what they are on. Inside "Enter as user" it is switched off (those are the customer's screens).
- `savePreferences` in `lib/platform.ts` was not kept: the one card calls the endpoint itself.
- The sweeps went past the inventory where a number was simply printed: billing amounts through `fmtMoney` / `fmtMoneyMajor` (invoice totals now show paise: "₹2,999.00"), counts through `fmtNumber`, hand-built percentages through `fmtPercent`. Left alone on purpose: typed inputs (sending hours picked as 24-hour text), `toFixed(1)` scores, CSV cells, small bounded counts, the public pricing page. The warmup PDF's KPI label `WARMTH Δ 24H` became `24H CHANGE` — the built-in font has no delta and printed junk.
- **The walk as built:** in the console walk the throwaway admin's own choice flips the Users table's "Signed up" cell (day-first → month-first → back) through the rail's dialog; both Settings pages are checked for the card; section 8d signs in a throwaway **Member** (new browser context, company `e2e-format-ws`, removed afterwards with its warmup copy). The source guard is the gate's last check.
- **Gates:** Django 1362, warmup pytest 56, `tsc` + build clean, browser gate 183/183.
- Found on the way (now in AGENTS.md): Vite's dev server closes itself when its standard input ends — start it with `CI=true`, or it dies in the middle of the gate with nothing in its log.

## Self-review

- Spec: the two choices and defaults (Task 1), the profile and the endpoint incl. the refusal inside "Enter as user" (Task 1), the table of what each format does and the one formatter with its rules (Tasks 4–5), where it is changed — both Settings pages and the sidebar of both apps (Tasks 4–5), documents always Indian on both backends (Tasks 2–3), tests incl. the guard and the walk (Task 6), what is not changed (stated in Global Constraints and in the sweep rules).
- Names match: `setPreferences` / `getPreferences` / `usePreferences` and the `fmt*` names are the same in the contract, Task 4 and Task 5; the server's field names (`format`, `clock`, `preferences`) are the same in Task 1 and the app wiring.
