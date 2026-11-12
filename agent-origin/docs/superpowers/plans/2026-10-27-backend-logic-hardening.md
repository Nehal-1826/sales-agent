# Backend Logic Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the verified safety and correctness flaws in the Django backend (spec: `docs/superpowers/specs/2026-10-27-ui-polish-and-logic-hardening-design.md` §3).

**Architecture:** Small, test-first changes inside `backend/core/`. New helpers live in focused modules (`core/runlock.py`, recipient helpers in `core/mailer.py`, confirmation flow in `core/actions.py`). Schema changes get new numbered migrations; applied migrations are never edited.

**Tech Stack:** Django 5 + DRF, SQLite locally, `unittest.mock` for network.

## Global Constraints

- Work from `E:/agent-sales/sales-agent/backend`; Windows venv → `.venv/Scripts/python`.
- Run tests with `DATABASE_URL=sqlite:///db.sqlite3 .venv/Scripts/python manage.py test <label>`.
- Never run `docker compose`, never touch `.env`, `Caddyfile`, `nginx.conf`, tunnel config.
- No network calls in tests — mock `requests`, LLM (`llm_complete`/`llm_available`), SMTP.
- Do NOT `git commit` (the owner commits). Leave changes in the working tree.
- Keep existing comment density/idiom: module docstrings, short "why" comments.
- After each task: full suite green + `manage.py makemigrations --check --dry-run` clean.
- Existing uncommitted work in the tree belongs to the owner — edit around it, never revert it (except Task B8's explicit migration move).

---

### Task 1: Close open registration

**Files:**
- Modify: `core/views.py` (`register`, ~line 78)
- Test: `core/tests/test_views.py` (`AuthTests`)

- [ ] **Step 1: Write the failing test** (add to `AuthTests`)

```python
    def test_register_closed_once_a_user_exists(self):
        first = self.client.post('/api/auth/register/', {
            'username': 'owner1', 'password': 'securepass123',
        }, content_type='application/json')
        self.assertEqual(first.status_code, 201)
        second = self.client.post('/api/auth/register/', {
            'username': 'intruder', 'password': 'securepass123',
        }, content_type='application/json')
        self.assertEqual(second.status_code, 403)
        self.assertFalse(User.objects.filter(username='intruder').exists())
```

- [ ] **Step 2: Run** `manage.py test core.tests.test_views.AuthTests` → new test FAILS (201).

- [ ] **Step 3: Implement** — first statement inside `register()`:

```python
    # First-boot only: the very first account becomes the owner.  After that
    # sign-up is closed — the app is reachable on a public URL and every
    # account sees the whole CRM, SMTP setup and send buttons.
    if User.objects.exists():
        return Response({'detail': 'Sign-up is closed — ask the workspace owner for an account.'},
                        status=403)
```

- [ ] **Step 4: Run** the AuthTests + full suite → PASS (existing `test_register_*` run on an empty DB, still 201/400).

### Task 2: Drafts — real recipients only, atomic claim, editable recipient, no re-draft loop

**Files:**
- Modify: `core/mailer.py` (`send_draft`; add `valid_recipient`, `claim_draft_for_send`)
- Modify: `core/views.py` (`draft_detail`, `draft_approve`, `draft_send`, `drafts_bulk_approve`, `lead_draft_email`)
- Modify: `core/actions.py` (`approve_draft`, `approve_all`, `draft_email` use the claim helper)
- Modify: `core/pipeline.py` (Copywright candidate query)
- Test: `core/tests/test_drafts_safety.py` (new)

**Interfaces — Produces:**
- `mailer.valid_recipient(email: str) -> bool` (django `validate_email`, rejects blank/placeholder)
- `mailer.claim_draft_for_send(draft_id: int, from_statuses=('draft','failed')) -> EmailDraft | None` — atomic conditional `UPDATE … SET status='approved'`; returns the refreshed draft or None if another request already claimed it.
- `send_draft(draft)` never invents an address: blank/invalid `to_email` → `status=failed`, `error='No recipient email — add one before sending.'`.

- [ ] **Step 1: Failing tests** (`core/tests/test_drafts_safety.py`)

```python
"""Outreach safety: no fabricated recipients, no double sends, recipient edits stick."""
from unittest import mock

from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.mailer import claim_draft_for_send, send_draft, valid_recipient
from core.models import EmailDraft, Lead, User
from core.pipeline import run_pipeline


class DraftSafetyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')
        self.lead = Lead.objects.create(company='Harbor Co', website='harborco.com', profiled=True)
        self.draft = EmailDraft.objects.create(lead=self.lead, company='Harbor Co',
                                               to_email='', subject='Hi', body='Body')

    def test_valid_recipient(self):
        self.assertTrue(valid_recipient('info@harborco.com'))
        for bad in ('', '   ', 'not-an-email', 'contact@'):
            self.assertFalse(valid_recipient(bad))

    def test_send_never_fabricates_an_address(self):
        send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.to_email, '')
        self.assertEqual(self.draft.status, EmailDraft.Statuses.FAILED)
        self.assertIn('No recipient', self.draft.error)

    def test_approve_without_recipient_is_400(self):
        resp = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(resp.status_code, 400)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.DRAFT)

    def test_recipient_edit_accepts_camel_case(self):
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'info@harborco.com'},
                               format='json')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.to_email, 'info@harborco.com')

    def test_recipient_edit_rejects_invalid(self):
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'nope'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_failed_drafts_are_editable(self):
        self.draft.status = EmailDraft.Statuses.FAILED
        self.draft.save()
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'a@harborco.com'},
                               format='json')
        self.assertEqual(resp.status_code, 200)

    def test_claim_is_single_use(self):
        self.assertIsNotNone(claim_draft_for_send(self.draft.id))
        self.assertIsNone(claim_draft_for_send(self.draft.id))

    def test_second_approve_is_409(self):
        self.draft.to_email = 'info@harborco.com'
        self.draft.save()
        first = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(first.status_code, 200)
        second = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(second.status_code, 409)

    def test_bulk_reports_missing_recipient_per_item(self):
        resp = self.client.post('/api/drafts/bulk_approve/', {'ids': [self.draft.id]}, format='json')
        self.assertEqual(resp.json()['failed'], 1)
        self.assertIn('recipient', resp.json()['results'][0]['error'].lower())

    def test_copywright_never_redrafts_a_rejected_lead(self):
        self.lead.contact_email = 'info@harborco.com'
        self.lead.save()
        self.draft.status = EmailDraft.Statuses.REJECTED
        self.draft.save()
        with mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]), \
             mock.patch('core.pipeline.gmaps_available', return_value=False), \
             mock.patch('core.pipeline.apify_maps_available', return_value=False), \
             mock.patch('core.pipeline.llm_available', return_value=False):
            run_pipeline(triggered_by='test')
        self.assertEqual(EmailDraft.objects.filter(lead=self.lead).count(), 1)
```

(`search_queries_for_cycle` returning `[]` also covers the latent `ZeroDivisionError` in `per_region_cap` — guard it with `max(1, len(queries))`.)

- [ ] **Step 2: Run** `manage.py test core.tests.test_drafts_safety` → FAIL (import errors first).

- [ ] **Step 3: Implement in `core/mailer.py`**

```python
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

NO_RECIPIENT_ERROR = 'No recipient email — add one before sending.'


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


def claim_draft_for_send(draft_id, from_statuses=(EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED)):
    """Atomically move a draft to APPROVED.  Returns the draft, or None when
    another request (double-click, chat 'approve all') already claimed it —
    the conditional UPDATE is what makes double sends impossible."""
    claimed = (EmailDraft.objects.filter(pk=draft_id, status__in=list(from_statuses))
               .update(status=EmailDraft.Statuses.APPROVED, updated_at=timezone.now()))
    return EmailDraft.objects.filter(pk=draft_id).first() if claimed else None
```

In `send_draft`, replace the whole `if not draft.to_email:` fabrication block with:

```python
    if not valid_recipient(draft.to_email):
        # never invent contact@<domain> — a guessed address reaches strangers
        draft.status = EmailDraft.Statuses.FAILED
        draft.error = NO_RECIPIENT_ERROR
        draft.save(update_fields=['status', 'error', 'updated_at'])
        return draft
```

- [ ] **Step 4: Implement in `core/views.py`**

`draft_detail` PUT:
```python
        if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
            return Response({'detail': 'only unsent drafts can be edited'}, status=409)
        incoming = request.data
        to_email = incoming.get('toEmail', incoming.get('to_email'))
        if to_email is not None:
            to_email = (to_email or '').strip()
            if to_email and not valid_recipient(to_email):
                return Response({'detail': 'That recipient email is not valid.'}, status=400)
            draft.to_email = to_email
        for field in ('subject', 'body'):
            if field in incoming:
                setattr(draft, field, (incoming[field] or '').strip())
        draft.save()
```

`draft_approve`:
```python
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
        return Response({'detail': f'draft is already {draft.status}'}, status=409)
    if not valid_recipient(draft.to_email):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    draft = claim_draft_for_send(draft.id)
    if draft is None:
        return Response({'detail': 'this draft is already being sent'}, status=409)
    send_draft(draft)
    return Response(EmailDraftSerializer(draft).data)
```

`draft_send` (retry): only FAILED → `claim_draft_for_send(id, from_statuses=(EmailDraft.Statuses.FAILED,))`, 409 when None, 400 when no valid recipient.

`drafts_bulk_approve`: per id — missing recipient → `{'id', 'ok': False, 'error': NO_RECIPIENT_ERROR}`; claim None → `'already being sent'`; else `send_draft`.

`lead_draft_email`: "active" = status in (DRAFT, APPROVED) only (a SENT/REJECTED/FAILED history no longer blocks a deliberate manual re-draft). Message: `f'{lead.company} already has an email waiting for approval — find it in Approvals.'`

- [ ] **Step 5: `core/actions.py`** — `approve_draft` / `approve_all` call `valid_recipient` then `claim_draft_for_send(d.id)`; skip (and report) drafts that fail either. `draft_email` uses the same DRAFT/APPROVED "active" rule.

- [ ] **Step 6: `core/pipeline.py` Copywright** — replace the in-memory candidate list:

```python
    candidates = (Lead.objects.filter(profiled=True).exclude(contact_email='')
                  .filter(drafts__isnull=True)          # never re-draft: rejected stays rejected
                  .order_by('-score')[:MAX_DRAFTS_PER_CYCLE * 3])
    no_email = Lead.objects.filter(profiled=True, contact_email='').count()
```
Loop over `candidates`, keep the `blocked` skip, stop at `MAX_DRAFTS_PER_CYCLE`. Also `per_region_cap = max(2, MAX_LEADS_PER_CYCLE // max(1, len(queries)))`.

- [ ] **Step 7: Run** the new module + full suite → PASS. Fix any existing test that relied on fabricated recipients (assert FAILED/no-recipient instead).

### Task 3: One cycle at a time — run lock, background manual runs, honest status, resilient worker

**Files:**
- Modify: `core/models.py` (`AppSettings.pipeline_running_since = DateTimeField(null=True, blank=True)`)
- Create: `core/migrations/0018_appsettings_pipeline_running_since.py` (via `makemigrations core -n appsettings_pipeline_running_since`)
- Create: `core/runlock.py`
- Modify: `core/pipeline.py` (`run_pipeline`, new `_run_cycle`, `start_pipeline_async`, `PipelineBusy`, `pipeline_status`, real `started_at`)
- Modify: `core/views.py` (`pipeline_run`)
- Modify: `core/actions.py` (`run_pipeline` action)
- Modify: `core/management/commands/run_worker.py`, `pipeline_loop.py`
- Test: `core/tests/test_runlock.py` (new)

**Interfaces — Produces:**
- `runlock.acquire_run_lock() -> bool`, `runlock.release_run_lock() -> None`, `runlock.running_since() -> datetime | None`; `STALE_AFTER = timedelta(minutes=45)` (a crashed process can't wedge the lock forever).
- `pipeline.PipelineBusy(Exception)`; `run_pipeline(triggered_by) -> PipelineRun` raises `PipelineBusy` if locked; `start_pipeline_async(triggered_by) -> bool` (False when busy).
- `pipeline_status()` adds: `autopilot` (=runs_enabled), `cycleRunning`, `cycleStartedAt`, `workerOnline`, and `lastRun.{finishedAt, leadsCreated, potentialsCreated, draftsCreated}`. Keeps legacy `running` (=runs_enabled) for old callers.
- `POST /api/pipeline/run/` → `202 {started: true, status}`; `409 {detail}` when busy; `?wait=1` keeps the old synchronous 201 behaviour (scripts/tests).

- [ ] **Step 1: Failing tests** (`core/tests/test_runlock.py`)

```python
"""One pipeline cycle at a time — API, chat and worker share one lock."""
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import runlock
from core.models import AppSettings, PipelineRun, User
from core.pipeline import PipelineBusy, pipeline_status, run_pipeline


def quiet_cycle():
    return [mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]),
            mock.patch('core.pipeline.gmaps_available', return_value=False),
            mock.patch('core.pipeline.apify_maps_available', return_value=False),
            mock.patch('core.pipeline.llm_available', return_value=False)]


class RunLockTests(TestCase):
    def test_second_acquire_fails_until_release(self):
        self.assertTrue(runlock.acquire_run_lock())
        self.assertFalse(runlock.acquire_run_lock())
        runlock.release_run_lock()
        self.assertTrue(runlock.acquire_run_lock())

    def test_stale_lock_is_reclaimed(self):
        s = AppSettings.load()
        s.pipeline_running_since = timezone.now() - timedelta(hours=2)
        s.save()
        self.assertTrue(runlock.acquire_run_lock())

    def test_run_pipeline_raises_when_busy(self):
        runlock.acquire_run_lock()
        with self.assertRaises(PipelineBusy):
            run_pipeline(triggered_by='test')

    def test_lock_released_and_started_at_is_cycle_start(self):
        patches = quiet_cycle()
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        before = timezone.now()
        run = run_pipeline(triggered_by='test')
        self.assertIsNone(runlock.running_since())
        run.refresh_from_db()
        self.assertGreaterEqual(run.started_at, before)
        self.assertLessEqual(run.started_at, run.finished_at)

    def test_status_reports_cycle_running(self):
        self.assertFalse(pipeline_status()['cycleRunning'])
        runlock.acquire_run_lock()
        status = pipeline_status()
        self.assertTrue(status['cycleRunning'])
        self.assertIsNotNone(status['cycleStartedAt'])
        self.assertIn('autopilot', status)
        self.assertIn('workerOnline', status)


class RunEndpointTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')

    def test_busy_is_409(self):
        runlock.acquire_run_lock()
        self.assertEqual(self.client.post('/api/pipeline/run/', {}, format='json').status_code, 409)

    def test_starts_in_background(self):
        with mock.patch('core.views.start_pipeline_async', return_value=True) as start:
            resp = self.client.post('/api/pipeline/run/', {}, format='json')
        self.assertEqual(resp.status_code, 202)
        self.assertTrue(resp.json()['started'])
        start.assert_called_once()
```

- [ ] **Step 2: Run** → FAIL (no `core.runlock`).

- [ ] **Step 3: `core/runlock.py`**

```python
"""Single-cycle lock — the API's Run button, chat "run a cycle" and the
worker's schedule all share it, so two cycles never scrape, enrich (paid
credits) or draft at the same time.

Stored on the AppSettings singleton: a conditional UPDATE is atomic on both
SQLite and PostgreSQL, so no extra infrastructure is needed.  A lock older
than STALE_AFTER belongs to a crashed process and may be taken over."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import AppSettings

STALE_AFTER = timedelta(minutes=45)


def acquire_run_lock():
    AppSettings.load()  # make sure the singleton row exists
    now = timezone.now()
    taken = (AppSettings.objects.filter(pk=1)
             .filter(Q(pipeline_running_since__isnull=True)
                     | Q(pipeline_running_since__lt=now - STALE_AFTER))
             .update(pipeline_running_since=now))
    return taken == 1


def release_run_lock():
    AppSettings.objects.filter(pk=1).update(pipeline_running_since=None)


def running_since():
    since = AppSettings.objects.filter(pk=1).values_list('pipeline_running_since', flat=True).first()
    if since and since < timezone.now() - STALE_AFTER:
        return None
    return since
```

- [ ] **Step 4: `core/pipeline.py`**

```python
class PipelineBusy(Exception):
    """Another cycle holds the run lock."""


def run_pipeline(triggered_by='manual'):
    """Run one orchestrator cycle synchronously.  Raises PipelineBusy when a
    cycle is already running anywhere (API, chat, worker)."""
    if not acquire_run_lock():
        raise PipelineBusy('A pipeline cycle is already running.')
    try:
        return _run_cycle(triggered_by)
    finally:
        release_run_lock()


def start_pipeline_async(triggered_by='manual'):
    """Take the lock now (so callers can answer 'busy' immediately), run the
    cycle on a daemon thread, release when done.  Returns False when busy."""
    if not acquire_run_lock():
        return False

    def _target():
        from django.db import connection
        try:
            _run_cycle(triggered_by)
        except Exception:
            log.exception('Background pipeline cycle failed')
        finally:
            release_run_lock()
            connection.close()  # thread-local connection — don't leak it

    threading.Thread(target=_target, name='pipeline-cycle', daemon=True).start()
    return True
```

Rename the old body to `def _run_cycle(triggered_by):`; first line `cycle_started = timezone.now()`; after `PipelineRun.objects.create(...)`:

```python
    # auto_now_add stamps creation (= the END of the cycle); record the real start
    PipelineRun.objects.filter(pk=run.pk).update(started_at=cycle_started)
    run.started_at = cycle_started
```

`pipeline_status()` additions (import `running_since` and `core.health.status_of`):

```python
    since = running_since()
    worker = status_of('worker', max_age_seconds=120)
    return {
        'running': settings.runs_enabled,          # legacy name — same as autopilot
        'autopilot': settings.runs_enabled,
        'frequency': settings.run_frequency,
        'cycleRunning': since is not None,
        'cycleStartedAt': since.isoformat() if since else None,
        'workerOnline': worker['running'],
        'lastRun': {
            'id': last.id,
            'at': started_at.isoformat() if started_at else None,
            'finishedAt': last.finished_at.isoformat() if last.finished_at else None,
            'leadsCreated': last.leads_created,
            'potentialsCreated': last.potentials_created,
            'draftsCreated': (last.summary or {}).get('drafts_created', last.replies_created),
            'summary': last.summary,
        } if last else None,
        'nextRunInMinutes': None if due else max(0, int(next_run_minutes - (elapsed or 0))),
    }
```
(`nextRunInMinutes` should be `None` when `runs_enabled` is False.)

- [ ] **Step 5: `core/views.py` `pipeline_run`**

```python
@api_view(['POST'])
def pipeline_run(request):
    """Start one cycle.  Default: background thread → 202 and the UI polls
    /pipeline/status/.  ?wait=1 runs synchronously (scripts)."""
    triggered_by = request.data.get('triggeredBy', 'manual')
    busy = Response({'detail': 'A cycle is already running — results appear when it finishes.'},
                    status=409)
    if request.query_params.get('wait') == '1':
        try:
            run = run_pipeline(triggered_by=triggered_by)
        except PipelineBusy:
            return busy
        return Response(PipelineRunSerializer(run).data, status=201)
    if not start_pipeline_async(triggered_by=triggered_by):
        return busy
    return Response({'started': True, 'status': pipeline_status()}, status=202)
```

- [ ] **Step 6: `core/actions.py` `run_pipeline`** → `start_pipeline_async(f'chat:{username}')`; when False: `'A cycle is already running — I\'ll have results in a few minutes.'`.

- [ ] **Step 7: `run_worker.py`** — start a heartbeat thread (`beat('worker')` every 30 s, daemon) so long cycles don't look dead; in the loop catch `PipelineBusy` (skip quietly) and on any other exception record `last_failure = time.time()` and don't retry until `time.time() - last_failure >= min(interval, 900)`. Same `PipelineBusy` catch in `pipeline_loop.py`.

- [ ] **Step 8: Run** `makemigrations core -n appsettings_pipeline_running_since`, then the new module + full suite → PASS.

### Task 4: Pipeline data quality — gates before paid enrichment, fair queue, strict AI verdict, right contacts

**Files:**
- Modify: `core/pipeline.py` (profile loop ordering, enrichment placement + backoff, `_ai_review` verdict)
- Modify: `core/scraper.py` (`extract_contact_email`, site-name pick)
- Modify: `core/gmaps.py` (`enrich_leads_via_gmaps` name fallback), `core/apify_maps.py` (title fallback)
- Modify: `core/icp.py` (`buyer_industries` guard)
- Test: `core/tests/test_data_quality.py` (new)

**Interfaces — Produces:**
- `scraper.pick_site_name(raw_title: str) -> str` — first non-generic segment of a title / og:site_name ('' if none).
- `pipeline.ENRICH_RETRY_HOURS = 72`; `lead.analysis['enrich_tried_at']` (ISO) records the last paid lookup.
- `_ai_review` → `True` only on an explicit `RELEVANT: yes`; `False` on explicit `no`; `None` (hold) otherwise.

- [ ] **Step 1: Failing tests** (`core/tests/test_data_quality.py`)

```python
"""Data-quality gates: who gets enriched, who gets emailed, what a lead is called."""
from unittest import mock

from django.test import TestCase

from core.gmaps import enrich_leads_via_gmaps
from core.icp import buyer_industries
from core.models import AppSettings, Lead
from core.pipeline import _ai_review
from core.scraper import extract_contact_email, pick_site_name


class ContactEmailTests(TestCase):
    def test_third_party_vendor_address_rejected(self):
        html = 'Site by Pixel Studio hello@pixelstudio.in'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'), '')

    def test_own_domain_preferred(self):
        html = 'hello@pixelstudio.in · info@smiledental.com'
        self.assertEqual(extract_contact_email(html, 'https://www.smiledental.com/contact'),
                         'info@smiledental.com')

    def test_free_mail_inbox_allowed(self):
        html = 'Write to smiledental.pune@gmail.com'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'),
                         'smiledental.pune@gmail.com')


class SiteNameTests(TestCase):
    def test_generic_segment_skipped(self):
        self.assertEqual(pick_site_name('Home | Smile Dental Clinic'), 'Smile Dental Clinic')
        self.assertEqual(pick_site_name('Welcome — Iron Gym Pune'), 'Iron Gym Pune')
        self.assertEqual(pick_site_name('Home'), '')


class AiVerdictTests(TestCase):
    def setUp(self):
        self.lead = Lead.objects.create(company='Smile', website='smile.com', industry='dental clinic')
        self.audit = {'analysis': {'text_excerpt': 'Family dentistry.'}}

    def _review(self, reply):
        with mock.patch('core.pipeline.llm_available', return_value=True), \
             mock.patch('core.pipeline.llm_complete', return_value=reply):
            return _ai_review(self.lead, self.audit, AppSettings.load())[0]

    def test_explicit_yes(self):
        self.assertTrue(self._review('RELEVANT: yes\nDESCRIPTION: A clinic.'))

    def test_markdown_no_is_rejected(self):
        self.assertFalse(self._review('**RELEVANT:** no\nDESCRIPTION: A blog.'))

    def test_refusal_is_held(self):
        self.assertIsNone(self._review('I cannot help with that.'))


class MapsMatchTests(TestCase):
    def test_name_match_skipped_when_listing_has_other_domain(self):
        lead = Lead.objects.create(company='Acme', website='acme.com')
        place = {'name': 'Acme Plumbing Works', 'phone': '+1 555 0100', 'website': 'acmeplumbing.com'}
        with mock.patch('core.gmaps.gmaps_search', return_value=[place]):
            self.assertEqual(enrich_leads_via_gmaps([lead], delay=0), [])


class IcpOverrideTests(TestCase):
    def test_override_that_matches_competitor_patterns_is_dropped(self):
        s = AppSettings.load()
        s.company_name, s.services = 'Shailog', ['web development', 'SEO']
        s.target_industries = 'dental clinic, marketing firm'
        s.save()
        picked = buyer_industries(s)
        self.assertIn('dental clinic', picked)
        self.assertNotIn('marketing firm', picked)
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `core/scraper.py`**

```python
FREE_MAIL_DOMAINS = {'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
                     'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me',
                     'protonmail.com', 'zoho.com', 'aol.com'}
GENERIC_TITLE_WORDS = {'home', 'homepage', 'home page', 'welcome', 'index', 'official site',
                       'official website', 'main', 'start'}


def _same_site(email_domain, site_domain):
    return (email_domain == site_domain or site_domain.endswith('.' + email_domain)
            or email_domain.endswith('.' + site_domain))


def pick_site_name(raw):
    """First segment of a title/og:site_name that is a real brand, not 'Home'."""
    for part in re.split(r'\s*[|–—·:-]\s*', raw or ''):
        part = part.strip()
        if 3 <= len(part) <= 60 and part.lower() not in GENERIC_TITLE_WORDS:
            return part
    return ''
```

`extract_contact_email` ending becomes:

```python
    domain = urlparse(base_url).netloc.lower().removeprefix('www.')
    role_names = ('info', 'contact', 'hello', 'office', 'sales', 'admin', 'mail', 'enquiries', 'support')
    own = [e for e in emails if _same_site(e.split('@')[1], domain)]
    # a free-mail inbox (gmail…) is how many small businesses are reached; any
    # OTHER company's domain is a third party (web designer credit, vendor) —
    # never email them about someone else's business
    free = [e for e in emails if e.split('@')[1] in FREE_MAIL_DOMAINS]
    pool = own or free
    if not pool:
        return ''
    role = [e for e in pool if e.split('@')[0] in role_names]
    return (role or pool)[0]
```

Site name: replace the `re.split(...)[0]` + length check with `site_name = pick_site_name(site_name)` and `if site_name: analysis['site_name'] = site_name`.

- [ ] **Step 4: `core/pipeline.py`**

`_ai_review` verdict parse:

```python
        verdict = re.search(r'RELEVANT\W*\s*(yes|no)\b', text, re.I)
        if not verdict:
            return None, ''   # no clear verdict (refusal, garbled) → hold, never admit
        relevant = verdict.group(1).lower() == 'yes'
```

Profile queue: `Lead.objects.filter(profiled=False).order_by('created_at')[:MAX_PROFILE_PER_CYCLE]` (oldest first — held leads are retried before newer ones starve them).

Move the Scalelist + Apollo block (currently between the audit and the ICP gate) to AFTER the AI gate passes, just before `lead.profiled = True`, wrapped in a helper:

```python
ENRICH_RETRY_HOURS = 72


def _enrich_due(lead):
    tried = (lead.analysis or {}).get('enrich_tried_at')
    if not tried:
        return True
    try:
        last = timezone.datetime.fromisoformat(tried)
    except ValueError:
        return True
    return timezone.now() - last >= timezone.timedelta(hours=ENRICH_RETRY_HOURS)


def _paid_phone_lookup(lead):
    """Scalelist → Apollo, only for vetted leads, at most once per
    ENRICH_RETRY_HOURS — paid credits are never spent on leads that the
    gates delete, or re-spent every cycle on the same leads."""
    if lead.contact_phone or not _enrich_due(lead):
        return ''
    lead.analysis = {**(lead.analysis or {}), 'enrich_tried_at': timezone.now().isoformat()}
    phone = scalelist_phone_find(email=lead.contact_email, company=lead.company, domain=lead.website)
    if phone:
        lead.analysis['phone_source'] = 'scalelist'
        return phone
    apollo = apollo_enrich_domain(lead.website)
    if apollo.get('employees'):
        lead.analysis['employees'] = apollo['employees']
    if apollo.get('phone'):
        lead.analysis['phone_source'] = 'apollo.io'
        return apollo['phone']
    return ''
```

In the profile loop (after the AI gate): `phone = _paid_phone_lookup(lead); if phone: lead.contact_phone = phone`. The ENRICH sweep: iterate `Lead.objects.filter(profiled=True).exclude(website='').filter(contact_phone='').order_by('-score')[:APOLLO_SWEEP_PER_CYCLE * 4]`, skip leads where `not _enrich_due(lead)`, stop after `APOLLO_SWEEP_PER_CYCLE` attempts, save `analysis` even on a miss. Apify round: only leads that `_enrich_due` was just stamped for this cycle (pass the `still_missing` list from the sweep, not a fresh unfiltered query).

- [ ] **Step 5: `core/gmaps.py`** — in the exact-name and token-name fallbacks, skip a place whose `website` normalizes to a different, non-empty domain than the lead's:

```python
        def _conflicts(p):
            other = _norm(p.get('website', ''))
            return bool(domain and other and other != domain)
```
use `if p.get('phone') and not _conflicts(p) and …`. Same rule in `apify_maps.py`: only use `by_title` when the place's website is empty or equals the lead's domain.

- [ ] **Step 6: `core/icp.py`** — in `buyer_industries`, guard overrides with both lists: `guards = _never_search_regexes(settings) + list(competitor_regexes(settings))`.

- [ ] **Step 7: Run** new module + full suite → PASS (update `test_scraper`/`test_gmaps` expectations only where they encoded the old third-party/name-collision behaviour).

### Task 5: LLM routing — keys only go to the provider they belong to, models that fit

**Files:**
- Modify: `core/ai.py` (`resolve_provider`, `llm_available`, `llm_complete`, new `model_for`)
- Modify: `core/models.py` (`AppSettings._absorb_env_secrets`)
- Modify: `core/onboarding.py` (`_provider_for_key`)
- Test: `core/tests/test_ai_routing.py` (new)

**Interfaces — Produces:**
- `ai.resolve_provider(name) -> str | None` — `None` for unknown names ('Anthropic', 'Other', typos); blank → `'openai'`.
- `ai.llm_available() -> bool` — key set AND provider known (unknown provider = keyless mode, so the strict AI gate doesn't hold every lead forever).
- `ai.model_for(provider: str, requested: str) -> str` — `requested` if it belongs to `provider`'s family, else `DEFAULT_MODELS[provider]`.

Native Claude support is out of scope (it must use the official `anthropic` SDK, not an OpenAI shim) — the UI stops offering "Anthropic" in Task F8.

- [ ] **Step 1: Failing tests** (`core/tests/test_ai_routing.py`)

```python
"""LLM routing: never post a key to the wrong company; never send a foreign model id."""
import os
from unittest import mock

from django.test import TestCase

from core import ai
from core.models import AppSettings


class RoutingTests(TestCase):
    def _settings(self, provider, key='k-123'):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = provider, key
        s.save()
        return s

    def test_unknown_provider_never_calls_openai(self):
        self._settings('Anthropic')
        with mock.patch('core.ai.requests.post') as post:
            self.assertIsNone(ai.llm_complete('hi'))
        post.assert_not_called()
        self.assertFalse(ai.llm_available())

    def test_known_provider_available(self):
        self._settings('Gemini')
        self.assertTrue(ai.llm_available())

    def test_model_for_rejects_foreign_family(self):
        self.assertEqual(ai.model_for('gemini', 'GLM-4.6'), ai.DEFAULT_MODELS['gemini'])
        self.assertEqual(ai.model_for('gemini', 'gemini-2.5-flash'), 'gemini-2.5-flash')
        self.assertEqual(ai.model_for('openai', ''), ai.DEFAULT_MODELS['openai'])
        self.assertEqual(ai.model_for('glm', 'GLM-4.6'), 'GLM-4.6')

    def test_request_uses_fitting_model(self):
        self._settings('Gemini')
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'choices': [{'message': {'content': 'ok'}}]}
        with mock.patch('core.ai.requests.post', return_value=resp) as post:
            ai.llm_complete('hi', model='GLM-4.6')
        self.assertEqual(post.call_args.kwargs['json']['model'], ai.DEFAULT_MODELS['gemini'])

    def test_env_provider_absorbed_with_key(self):
        AppSettings.objects.all().delete()
        with mock.patch.dict(os.environ, {'AI_KEY': 'AIza-test', 'AI_PROVIDER': 'Gemini'}):
            s = AppSettings.load()
        self.assertEqual(s.ai_provider, 'Gemini')
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `core/ai.py`**

```python
MODEL_FAMILIES = {
    'openai': ('gpt-', 'o1', 'o3', 'o4', 'chatgpt'),
    'glm': ('glm',), 'zhipu': ('glm',),
    'deepseek': ('deepseek',),
    'mistral': ('mistral', 'open-mistral', 'codestral', 'ministral', 'pixtral'),
    'gemini': ('gemini',), 'google': ('gemini',),
    'groq': (), 'ollama': (),   # host many families — accept whatever is set
}


def resolve_provider(provider):
    """Free-text provider name → known key; None when we don't know where it
    lives (never fall back to OpenAI — that would send someone else's key there)."""
    key = (provider or '').strip().lower()
    if not key:
        return 'openai'
    for name in PROVIDER_BASE_URLS:
        if name in key:
            return name
    return None


def model_for(provider, requested):
    """The agent's configured model when it belongs to this provider, else
    the provider default (a GLM id sent to Gemini fails every call)."""
    requested = (requested or '').strip()
    families = MODEL_FAMILIES.get(provider, ())
    if requested and (not families or requested.lower().startswith(families)):
        return requested
    return DEFAULT_MODELS[provider]


def llm_available():
    s = AppSettings.load()
    return bool(s.ai_key) and resolve_provider(s.ai_provider) is not None
```

`provider_base_url` → `PROVIDER_BASE_URLS[resolve_provider(provider) or 'openai']` (only used for display). In `llm_complete`: after loading settings, `provider = resolve_provider(settings.ai_provider)`; `if provider is None: log.warning('Unsupported AI provider %r — AI disabled', settings.ai_provider); return None`; body `'model': model_for(provider, model)`.

- [ ] **Step 4: `core/models.py` `_absorb_env_secrets`** — after the loop: if `'ai_key'` was absorbed this call and `os.environ.get('AI_PROVIDER')`, set `self.ai_provider` to it (the default 'OpenAI' must not mask the env's provider); include it in `update_fields`.

- [ ] **Step 5: `core/onboarding.py` `_provider_for_key`** — `gsk_` → `'Groq'`, `AIza` → `'Gemini'`, `sk-` → `'OpenAI'`; keep existing GLM detection for `xxx.yyy`-style keys.

- [ ] **Step 6: Run** new module + full suite → PASS.

### Task 6: Chat & guide actions — confirm before acting, never act on questions

**Files:**
- Modify: `core/models.py` (`User.pending_action = JSONField(default=dict, blank=True)`)
- Create: migration `0019_user_pending_action` (via `makemigrations core -n user_pending_action`)
- Modify: `core/actions.py` (guards, `prepare`, `handle_command`, `delete_lead` cleanup, `_match_company` ambiguity)
- Modify: `core/chat.py` (`responder_reply(text, turn, user)`), `core/guide.py` (`guide_answer(question, history, user)`), `core/views.py` (`chat`, `guide` pass `request.user`; chat POST response adds `pendingAction`)
- Test: `core/tests/test_actions_safety.py` (new)

**Interfaces — Produces:**
- `actions.CONFIRM_ACTIONS = {'approve_draft', 'approve_all', 'reject_draft', 'delete_lead', 'switch_profile', 'set_report_email'}`
- `actions.is_question_or_negation(text) -> bool`
- `actions.handle_command(text, user, history=None) -> str` — '' when the message is not a command. Flow: pending + yes → execute stored spec; pending + no → cancel; question/negation → ''; detect → CONFIRM action → store `user.pending_action = {'spec', 'summary', 'expires'}` (10 min) and return the summary ending in `Reply "yes" to confirm or "no" to cancel.`; other actions execute immediately.
- `actions.pending_summary(user) -> str | None` (for the API's `pendingAction`).
- `execute(spec, username)` unchanged signature; `approve_draft`/`reject_draft` specs may carry `draft_ids` resolved at prepare time — execution re-checks they are still `draft`.

- [ ] **Step 1: Failing tests** (`core/tests/test_actions_safety.py`)

```python
"""Chat actions: questions never act, destructive actions need an explicit yes."""
from django.test import TestCase

from core.actions import detect_action_regex, handle_command, is_question_or_negation
from core.models import AppSettings, EmailDraft, Lead, SearchProfile, User


class GuardTests(TestCase):
    def test_questions_and_negations(self):
        for text in ('should I send all the drafts?', "don't send all the emails yet",
                     'what happens if I stop the runs?', 'when will the next run of the pipeline start?'):
            self.assertTrue(is_question_or_negation(text), text)
        for text in ('Approve all drafts', 'Run a cycle', 'pause the runs'):
            self.assertFalse(is_question_or_negation(text), text)


class ConfirmFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.d1 = EmailDraft.objects.create(company='Acme', to_email='a@acme.com', subject='s', body='b')
        self.d2 = EmailDraft.objects.create(company='Beta', to_email='b@beta.com', subject='s', body='b')

    def test_question_does_nothing(self):
        self.assertEqual(handle_command('should I send all the drafts?', self.user), '')
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)

    def test_approve_all_asks_then_sends_on_yes(self):
        reply = handle_command('approve all drafts', self.user)
        self.assertIn('yes', reply.lower())
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)
        handle_command('yes', self.user)
        self.assertEqual(EmailDraft.objects.filter(status='sent').count(), 2)

    def test_no_cancels(self):
        handle_command('approve all drafts', self.user)
        self.assertIn('cancel', handle_command('no', self.user).lower())
        self.user.refresh_from_db()
        self.assertEqual(self.user.pending_action, {})
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)

    def test_delete_lead_with_empty_name_never_deletes(self):
        Lead.objects.create(company='Only Lead')
        handle_command('delete the lead', self.user)
        handle_command('yes', self.user)
        self.assertEqual(Lead.objects.count(), 1)

    def test_delete_lead_rejects_its_drafts_and_blacklists(self):
        lead = Lead.objects.create(company='Gone Co', website='gone.co')
        d = EmailDraft.objects.create(lead=lead, company='Gone Co', to_email='x@gone.co', subject='s', body='b')
        from core.actions import execute
        execute({'action': 'delete_lead', 'company': 'Gone Co'})
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.REJECTED)
        self.assertIn('gone.co', AppSettings.load().rejected_domains)

    def test_regex_no_longer_reads_approve_n_drafts_as_all(self):
        spec = detect_action_regex('approve the drafts for Acme') or {}
        self.assertNotEqual(spec.get('action'), 'approve_all')
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `core/actions.py` — guards + confirmation flow**

```python
CONFIRM_ACTIONS = {'approve_draft', 'approve_all', 'reject_draft', 'delete_lead',
                   'switch_profile', 'set_report_email'}
PENDING_TTL_MINUTES = 10
_YES = re.compile(r'^\s*(yes|y|yeah|yep|sure|ok|okay|confirm|go ahead|do it|haan|ha|aama|seri|sari)\b[\s.!]*$', re.I)
_NO = re.compile(r'^\s*(no|n|nope|nah|cancel|stop|don\'?t|venda|vendam|illa)\b[\s.!]*$', re.I)
_NEGATION = re.compile(r"\b(don'?t|do not|not yet|never|shouldn'?t|wouldn'?t|without)\b", re.I)
_QUESTION_START = re.compile(r'^\s*(should|would|could|can|will|when|what|why|how|is|are|do|does|did|which|who)\b', re.I)


def is_question_or_negation(text):
    """Questions and negations are conversation, never commands — 'should I
    send all the drafts?' must not send them."""
    t = (text or '').strip()
    return t.endswith('?') or bool(_NEGATION.search(t)) or bool(_QUESTION_START.match(t))
```

Regex fixes in `detect_action_regex`: approve-all only for `approve\s+(all|every|everything)\b|send\s+all\s+(the\s+)?(drafts|emails)` (drop `approve\s+\S+\s+drafts`); add `if re.search(r'\b(delete|remove)\b.*\blead\b', q): return {'action': 'delete_lead', 'company': <text after "lead"> }` only when a non-empty name follows, else `{'action': 'delete_lead', 'company': ''}`.

`_match_company(name, candidates)` → returns a list: exact match → `[exact]`; else all containment matches (de-duplicated). Callers: 0 → "No matching …", >1 → `f'Which one? {", ".join(m[:5])}'`, 1 → proceed. Empty `name` → `[]` (never "matches everything").

```python
def _describe(spec):
    """Prepare a confirmable action: resolve its exact targets now and say
    precisely what will happen.  Returns (summary, resolved_spec) or
    (message, None) when there is nothing to confirm."""
    action = spec['action']
    if action == 'approve_all':
        drafts = list(EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT))
        if not drafts:
            return 'Nothing is waiting — no drafts need approval right now.', None
        names = ', '.join(d.company for d in drafts[:5]) + (' …' if len(drafts) > 5 else '')
        return (f'I\'ll approve and send {len(drafts)} email(s): {names}.',
                {**spec, 'draft_ids': [d.id for d in drafts]})
    if action in ('approve_draft', 'reject_draft'):
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        matches = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
        if len(matches) != 1:
            return _no_single_match('draft', matches, drafts.values_list('company', flat=True)), None
        ids = list(drafts.filter(company=matches[0]).values_list('id', flat=True))
        verb = 'approve and send' if action == 'approve_draft' else 'reject'
        return f'I\'ll {verb} the email to {matches[0]}.', {**spec, 'company': matches[0], 'draft_ids': ids}
    if action == 'delete_lead':
        matches = _match_company(spec.get('company'), list(Lead.objects.values_list('company', flat=True)))
        if len(matches) != 1:
            return _no_single_match('lead', matches, []), None
        return (f'I\'ll delete the lead {matches[0]}, reject its unsent emails and never rediscover it.',
                {**spec, 'company': matches[0]})
    if action == 'switch_profile':
        profile = match_profile(spec.get('profile'), list(SearchProfile.objects.all()))
        if profile is None:
            return 'Which profile? ' + ', '.join(SearchProfile.objects.values_list('name', flat=True)), None
        if profile.is_active:
            return f'"{profile.name}" is already the active profile.', None
        return f'I\'ll switch lead targeting to "{profile.name}".', {**spec, 'profile': profile.name}
    if action == 'set_report_email':
        return f'I\'ll send the daily report to {spec.get("email")} from now on.', spec
    return '', spec


def handle_command(text, user, history=None):
    """One entry point for chat + guide.  '' = not a command (let the
    conversational reply answer)."""
    pending = (getattr(user, 'pending_action', None) or {}) if user else {}
    if pending:
        expired = pending.get('expires', '') < timezone.now().isoformat()
        if not expired and _YES.match(text):
            _set_pending(user, {})
            return execute(pending['spec'], username=user.username)
        if _NO.match(text):
            _set_pending(user, {})
            return 'Okay — cancelled, nothing was changed.'
        _set_pending(user, {})   # any other message drops the stale confirmation
    if is_question_or_negation(text):
        return ''
    spec = detect_action(text, history)
    if not spec or spec.get('action') == 'none':
        return ''
    if spec['action'] not in CONFIRM_ACTIONS:
        return execute(spec, username=getattr(user, 'username', 'chat'))
    summary, resolved = _describe(spec)
    if resolved is None:
        return summary
    if user is None:
        return summary + ' Open the Assistant to confirm.'
    _set_pending(user, {'spec': resolved, 'summary': summary,
                        'expires': (timezone.now() + timezone.timedelta(minutes=PENDING_TTL_MINUTES)).isoformat()})
    return f'{summary} Reply "yes" to confirm or "no" to cancel.'


def _set_pending(user, value):
    user.pending_action = value
    user.save(update_fields=['pending_action'])


def pending_summary(user):
    p = getattr(user, 'pending_action', None) or {}
    return p.get('summary') if p and p.get('expires', '') >= timezone.now().isoformat() else None
```

`execute` changes: `approve_all`/`approve_draft` iterate `draft_ids` when present (else current DRAFT rows), each via `valid_recipient` + `claim_draft_for_send` (Task B2); `reject_draft` updates only `draft_ids` still in DRAFT. `delete_lead`: before deleting, `lead.drafts.filter(status__in=['draft','failed']).update(status='rejected')`, add `_norm_domain(lead.website)` to `rejected_domains` (import from `core.pipeline` lazily), then delete.

- [ ] **Step 4: Wire callers**
  - `chat.responder_reply(text, turn=0, user=None)`: `result = handle_command(text, user)`; non-empty → `_phrase_reply(text, result)` **unless** the result contains `Reply "yes"` (confirmation prompts are returned verbatim — the LLM must not rephrase away the yes/no instruction).
  - `guide.guide_answer(question, history=None, user=None)`: same via `handle_command(question, user, history)`.
  - `views.chat` POST: `responder_reply(text, turn=user_msg.id, user=request.user)`; response adds `'pendingAction': pending_summary(request.user)`. `views.guide` passes `user=request.user`.

- [ ] **Step 5:** `makemigrations core -n user_pending_action`; run new module + `test_chat` + full suite → PASS (update `test_chat` cases that expected immediate execution of approve/reject/delete to send "yes" first).

### Task 7: Onboarding that can't clobber a configured workspace + secrets hygiene

**Files:**
- Modify: `core/onboarding.py` (`onboarding_status`, `onboarding_reply`, `_parse_target`, `_parse_mailbox`, new `redact_for_history`)
- Modify: `core/views.py` (`chat` stores the redacted text)
- Modify: `core/serializers.py` (`AgentConfigSerializer` masks `api.auth`, `db.connection`; ignores masked values on write)
- Modify: `core/apify_maps.py` (token in `Authorization: Bearer` header, not URL/params)
- Modify: `core/mailer.py` (`_ssl_contexts` unverified fallback only when `settings.DEBUG`)
- Test: `core/tests/test_onboarding_safety.py` (new)

**Interfaces — Produces:**
- Wizard step key `'existing'`: when the workspace already has a `company_name` and this user hasn't started, the first question is *"This workspace is already set up for {company} ({services}). Reply "keep" to use it as is, or "change" to walk through setup again."* `keep`/`yes` → done (nothing written); `change` → normal step 0; anything else → re-ask.
- Company step re-asks on greetings/questions (`hi`, `hello`, text ending in `?`) instead of saving them as the company name.
- Target step re-asks when `_parse_target` can't tell (returns `None` instead of defaulting to `'buyer'`).
- `onboarding.redact_for_history(text, step_key) -> str` — `ai_key` step: `'🔒 API key (hidden)'` when the text looks like a key; `email` step: `'🔒 {email}:••••••'`.
- `_parse_mailbox`: password = everything after the address separator, with internal spaces removed (Gmail app passwords are pasted as `abcd efgh ijkl mnop`).

- [ ] **Step 1: Failing tests** (`core/tests/test_onboarding_safety.py`)

```python
"""Onboarding never overwrites a configured workspace; secrets never land in chat history."""
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import AppSettings, ChatMessage, User
from core.onboarding import _parse_mailbox, onboarding_reply, onboarding_status, redact_for_history


class ExistingWorkspaceTests(TestCase):
    def setUp(self):
        s = AppSettings.load()
        s.company_name, s.services = 'Shailog', ['SaaS builds']
        s.save()
        self.user = User.objects.create_user(username='teammate', password='pass12345')

    def test_existing_setup_offered_first(self):
        status = onboarding_status(self.user)
        self.assertEqual(status['stepKey'], 'existing')
        self.assertIn('Shailog', status['question'])

    def test_keep_finishes_without_writing(self):
        onboarding_reply('keep', self.user)
        self.assertTrue(onboarding_status(self.user)['done'])
        self.assertEqual(AppSettings.load().company_name, 'Shailog')

    def test_greeting_is_not_a_company_name(self):
        onboarding_reply('change', self.user)
        onboarding_reply("hi, what's the status of my leads?", self.user)
        self.assertEqual(AppSettings.load().company_name, 'Shailog')


class RedactionTests(TestCase):
    def test_redaction(self):
        self.assertNotIn('AIzaSyD', redact_for_history('AIzaSyD-1234567890abcdefghijkl', 'ai_key'))
        red = redact_for_history('hello@x.com:supersecret', 'email')
        self.assertIn('hello@x.com', red)
        self.assertNotIn('supersecret', red)
        self.assertEqual(redact_for_history('Acme Inc', 'company'), 'Acme Inc')

    def test_gmail_app_password_with_spaces(self):
        self.assertEqual(_parse_mailbox('me@gmail.com abcd efgh ijkl mnop'),
                         ('me@gmail.com', 'abcdefghijklmnop'))

    def test_chat_history_stores_redacted_key(self):
        user = User.objects.create_user(username='fresh', password='pass12345', role='owner')
        user.onboarding = {'started': True, 'step': 6, 'answers': {}}
        user.save()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        client.post('/api/chat/', {'text': 'AIzaSyD-1234567890abcdefghijkl'}, format='json')
        stored = ChatMessage.objects.filter(user=user, role='user').first().text
        self.assertNotIn('AIzaSyD', stored)
```

(Check the actual index of the `ai_key` step in `STEPS` and use it instead of `6` if different.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** per the Interfaces above:
  - `onboarding_status`: if not `state.get('started')` and `settings.company_name` → return the `existing` payload (`stepIndex 0`, same `stepCount`).
  - `onboarding_reply`: before step parsing — if not started and `settings.company_name`: `keep|yes|ok|fine|use it` → `_save_state(user, done=True, kept_existing=True)` + short confirmation; `change|redo|start over|setup` → `_save_state(user, started=True, step=0)` + `_question_message(0)`; else re-ask the existing question.
  - Company step: `if re.match(r'^\s*(hi|hello|hey|vanakkam)\b', lowered) or text.strip().endswith('?')` → re-ask.
  - `_parse_target` returns `None` when no buyer/agency signal; target step re-asks: `'Is it businesses that BUY what you sell, or other agencies to partner with? Say "buyers" or "agencies".'`
  - `views.chat`: compute `key = onboarding_status(request.user, settings)['stepKey']` before creating the user message (only while onboarding is active) and store `redact_for_history(text, key)`; the reply still receives the raw text.
- [ ] **Step 4: Secrets hygiene**
  - `AgentConfigSerializer.to_representation`: `'auth': '••••' + instance.api_auth[-4:] if instance.api_auth else ''`, same for `connection`; `update` ignores values starting with `'••••'`.
  - `apify_maps.py`: drop `token` from URLs/params; send `headers={'Authorization': f'Bearer {key}'}` on every request.
  - `mailer._ssl_contexts`: yield the unverified context only `if django_settings.DEBUG` (import `from django.conf import settings as django_settings`).
- [ ] **Step 5: Run** new module + `test_onboarding` + `test_smtp_connect` + full suite → PASS (adjust onboarding tests that start on a configured workspace to answer "change" first).

### Task 8: Migration hygiene, API fields the new UI needs, small correctness fixes

**Files:**
- Modify: `core/migrations/0015_searchprofile_appsettings_icp_mode_and_more.py` — restore the committed version (`git checkout -- <path>`; this file was edited after it shipped).
- Create: `core/migrations/0020_seed_saas_builds_profile.py` — idempotent `get_or_create` of "Shailog — SaaS Builds (high level)" with the exact defaults that were added to 0015 (copy them from the current working-tree diff BEFORE restoring 0015), reverse = delete by name.
- Modify: `core/serializers.py` — `LeadSerializer` adds `discoveredAt` (ISO `created_at`); `EmailDraftSerializer` adds `leadId` (`lead_id`, read-only) and `sentAt` (ISO or null).
- Modify: `core/views.py` `outreach_status` adds `'approved'` count; `agents` view: `status` = `'Paused'` when `not runs_enabled`, `'Running'` when the run lock is held, else `'Ready'`.
- Modify: `core/pipeline.py` — template subject fallback `'Quick idea for {{company}}'` (plain string, not an f-string).
- Modify: `core/management/commands/daily_report.py` — parse `--day` with `date.fromisoformat`.
- Modify: `core/reports.py` — sort potentials in Python by numeric value (digits of `value`), descending.
- Modify: `core/chat.py` `_keyword_reply` — greeting match by word: `re.search(r'\b(hi|hello|hey|vanakkam)\b', q)`.
- Test: `core/tests/test_misc_fixes.py` (new)

- [ ] **Step 1: Failing tests** (`core/tests/test_misc_fixes.py`)

```python
"""Small correctness fixes + fields the new UI relies on."""
from datetime import date
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.chat import _keyword_reply
from core.models import EmailTemplate, Lead, SearchProfile
from core.pipeline import _draft_email
from core.serializers import LeadSerializer


class MiscTests(TestCase):
    def test_lead_has_iso_discovered_at(self):
        lead = Lead.objects.create(company='Acme')
        self.assertIn('T', LeadSerializer(lead).data['discoveredAt'])

    def test_empty_template_subject_gets_company(self):
        EmailTemplate.objects.create(name='t', subject='', body='Hi {{company}}', is_default=True)
        lead = Lead.objects.create(company='Acme', contact_email='a@acme.com')
        with mock.patch('core.pipeline.llm_available', return_value=False):
            subject, _body, _ = _draft_email(lead)
        self.assertEqual(subject, 'Quick idea for Acme')

    def test_daily_report_day_flag(self):
        with mock.patch('core.management.commands.daily_report.send_daily_report',
                        return_value=('console', 's')) as send:
            call_command('daily_report', '--day', '2026-10-01', stdout=StringIO())
        self.assertEqual(send.call_args.args[0], date(2026, 10, 1))

    def test_which_is_not_a_greeting(self):
        self.assertNotIn('Hey!', _keyword_reply('which leads are new'))

    def test_saas_profile_seeded(self):
        self.assertTrue(SearchProfile.objects.filter(name='Shailog — SaaS Builds (high level)').exists())
```

(Adjust the `daily_report` patch target to wherever the command imports `send_daily_report` from.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the bullets above. **Step 4:** `makemigrations --check --dry-run` clean; run new module + full suite → PASS; `migrate` the dev DB (`DATABASE_URL=sqlite:///db.uidev.sqlite3`) so the local UI stack has the new columns.

---

## Self-review notes

- Spec §3 items 1–17 map to: 1→B1 · 2,3→B2 · 4→B6 · 5→B7 · 6→B7 · 7–10→B3 · 11,12,14→B4 · 13→B2 · 15→B5 · 16→B8 · 17→B4/B8.
- Migration numbering: B3 → 0018, B6 → 0019, B8 → 0020. Run tasks in order B1…B8.
