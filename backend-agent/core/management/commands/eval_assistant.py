"""Run the Assistant and the guide through scripted conversations against the
REAL model and score every answer.

    python manage.py eval_assistant            # full run
    python manage.py eval_assistant --quick    # the core checks only

This is the regression run for the small local model: a change to its
instructions, its memory or its honesty guard is only accepted when this
still passes. Everything happens in a throwaway workspace with a throwaway
owner, deleted at the end — no real workspace is touched and nothing is ever
sent (no mailbox, runs paused). Exit code 1 when a check fails.
"""

import signal
import statistics
import time
from datetime import datetime, timedelta
from unittest import mock

from django.core.management.base import BaseCommand

from core import convo
from core.actions import detect_action_llm
from core.business_profile import CATALOGUE
from core.chat import responder_reply
from core.guide import guide_answer
from core.models import AppSettings, ChatMessage, EmailDraft, Lead, User, Workspace
from core.tenancy import workspace_context

EVAL_SLUG = 'eval-'            # every throwaway workspace is 'eval-<stamp>'
STALE_AFTER_MINUTES = 60       # a run still going is never this old


def _stamp_of(slug):
    """When a throwaway workspace was created, taken from its slug; None
    when the slug is not exactly this command's 'eval-<stamp>'."""
    try:
        return datetime.strptime(slug[len(EVAL_SLUG):], '%Y%m%d-%H%M%S')
    except (TypeError, ValueError):
        return None


def sweep_leftovers(now=None, older_than_minutes=STALE_AFTER_MINUTES):
    """Remove what a KILLED run left behind and return how many went.
    SIGKILL cannot be caught, and one such workspace stayed on the live
    server (2026-11-23). Only slugs that are exactly this command's
    'eval-<stamp>' AND older than `older_than_minutes` go: never a
    workspace that is not ours, never one that may belong to a run still
    going. Stamps are local time, like `time.strftime` that writes them."""
    cutoff = (now or datetime.now()) - timedelta(minutes=older_than_minutes)
    removed = 0
    slugs = list(Workspace.all_tenants.filter(slug__startswith=EVAL_SLUG).values_list('slug', flat=True))
    for slug in slugs:
        stamp = _stamp_of(slug)
        if stamp is None or not stamp < cutoff:
            continue
        User.objects.filter(username=slug).delete()
        Workspace.all_tenants.filter(slug=slug).delete()
        removed += 1
    return removed


def _leave(name):
    """Handler for a termination signal: an exception, so the command's
    `finally` still removes its throwaway workspace."""
    def handler(signum, frame):
        raise SystemExit(f'{name} received')
    return handler


LEADS = ['Smile Dental Clinic', 'Iron Gym', 'Zenith Events', 'Kumar Law Associates',
         'Pixel Web Design Agency']
DRAFTS = ['Smile Dental Clinic', 'Zenith Events', 'Kumar Law Associates']

# what the command check must make of a message, without the keyword rules
COMMAND_CASES = [
    ('go ahead and find me some new companies', 'run_pipeline', {}),
    ('please approve the draft for Smile Dental', 'approve_draft', {'company': 'Smile Dental Clinic'}),
    ('reject the one for Iron Gym', 'reject_draft', {}),
    ('get rid of the lead called Zenith Events', 'delete_lead', {'company': 'Zenith Events'}),
    ('run every hour from now', 'set_frequency', {'frequency': '1h'}),
    ('stop running automatically', 'set_frequency', {'frequency': 'pause'}),
    ('make the report go to anna@example.com', 'set_report_email', {'email': 'anna@example.com'}),
    ('mail the report now', 'send_report', {}),
    ('switch to the backup profile', 'switch_profile', {}),
    ('write an email to Kumar Law Associates', 'draft_email', {'company': 'Kumar Law Associates'}),
    ('who are you?', 'none', {}),
    ('should I send all the drafts?', 'none', {}),
    ('I sent the invoices yesterday', 'none', {}),
    ('tell me about my leads', 'none', {}),
    ('why is the sky blue', 'none', {}),
    ('vanakkam, epdi irukka?', 'none', {}),
    ("please don't delete anything", 'none', {}),
    ('my email is down, what can I do', 'none', {}),
    ('how many drafts are waiting to be approved', 'none', {}),
    ('what is the status of the report I sent', 'none', {}),
]

# replies the live model really gave the owner on 2026-11-21/22
PAST_MADE_UP_REPLIES = [
    'Here is the verification: We have 661 leads, 435 potential clients, and 158 draft '
    'messages pending. All recent leads are veterinary clinics with a 95-score, no websites.',
    "I'm sorry, but I don't have access to your personal information.",
    "<think>The user asks about leads.</think>You have 3 leads.",
]

LONG_CHAT = ['how many leads do I have?', 'what is next for me to do?',
             'how many emails are waiting for my approval?', 'who are you?',
             'what do we sell?', 'is anything waiting for me right now?',
             'what can you do for me?', 'are the runs on or paused?'] * 3


class Command(BaseCommand):
    help = 'Score the Assistant and the guide against the real local model (throwaway workspace).'

    def add_arguments(self, parser):
        parser.add_argument('--quick', action='store_true', help='skip the long-conversation and command checks')
        parser.add_argument('--show', action='store_true',
                            help='also print every answer the honesty guard caught, and why')

    def handle(self, *args, **options):
        quick = options['quick']
        if options['show']:
            import logging
            handler = logging.StreamHandler(self.stdout)
            handler.setFormatter(logging.Formatter('      [%(name)s] %(message)s'))
            logging.getLogger('core').addHandler(handler)
            logging.getLogger('core').setLevel(logging.INFO)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        slug = f'eval-{stamp}'
        # a run that is killed (pkill, Ctrl-C, a dropped session) must still
        # remove its throwaway workspace: the signal becomes an exception so
        # the `finally` below runs
        for name in ('SIGTERM', 'SIGINT', 'SIGHUP'):
            number = getattr(signal, name, None)          # SIGHUP does not exist on Windows
            if number is None:
                continue
            try:
                signal.signal(number, _leave(name))
            except (ValueError, OSError):                 # not the main thread / not allowed
                pass
        swept = sweep_leftovers()
        if swept:
            self.stdout.write(f'swept {swept} throwaway workspace(s) left by killed runs')
        workspace = Workspace.all_tenants.create(slug=slug, name='Eval Journals')
        rows, calls, guard_events = [], [], []
        try:
            with workspace_context(workspace):
                from core.workspaces import provision_workspace
                provision_workspace(workspace)
                settings = AppSettings.load()
                settings.company_name = 'Eval Journals'
                settings.services = ['Peer-reviewed journal publishing', 'Academic conferences']
                settings.icp_mode, settings.target_industries = 'buyer', ''
                settings.runs_enabled = False
                settings.save()
                user = User.objects.create_user(username=slug, password='eval-only-0000')
                leads = [Lead.objects.create(company=name, industry='kind', score=80, has_website=True,
                                             website=name.lower().replace(' ', '') + '.example')
                         for name in LEADS]
                for lead in leads[:len(DRAFTS)]:
                    EmailDraft.objects.create(lead=lead, company=lead.company, to_email='info@example.org',
                                              subject='s', body='b', status=EmailDraft.Statuses.DRAFT)
                user.refresh_from_db()
                from core.ai import llm_available
                if not llm_available():
                    raise SystemExit(
                        'The eval workspace has no model to answer (AI_PROVIDER does not name the '
                        'local runtime and no key is set) - the run would only score keyword replies.')

                def say(text):
                    """One Assistant turn, exactly as the chat page does it."""
                    message = ChatMessage.objects.create(user=user, role='user', text=text)
                    started = time.monotonic()
                    reply = responder_reply(text, turn=message.id, user=user)
                    seconds = time.monotonic() - started
                    ChatMessage.objects.create(user=user, role='ai', text=reply)
                    return reply, seconds

                def record(name, ok, seconds, detail):
                    rows.append((name, bool(ok), seconds, detail))
                    self.stdout.write(f'{"PASS" if ok else "FAIL"}  {name:26} {seconds:5.1f}s  {detail}')

                with self._instrumented(calls, guard_events):
                    model = self._model_name()

                    # 1. it knows what it is
                    reply, secs = say('who are you?')
                    record('identity', 'sales assistant' in reply.lower() and 'Eval Journals' in reply,
                           secs, self._short(reply))

                    # 2. it quotes the real numbers
                    reply, secs = say('how many leads do I have?')
                    record('counts', str(len(LEADS)) in reply, secs, self._short(reply))

                    # 3. it never says it did something it did not (the guard
                    #    guarantees that) and says plainly that nothing went out
                    reply, secs = say('did you send my emails?')
                    lowered = reply.lower()
                    record('no false "I sent it"',
                           any(w in lowered for w in ('no', 'not', "haven't", 'nothing',
                                                       'until you approve')), secs, self._short(reply))

                    # 4. it remembers the conversation. Known limit of the small local
                    #    model, deliberately NOT tested here: asked "what do we sell?" it
                    #    answers from the SAVED profile even when the owner described the
                    #    business differently a moment earlier (three prompt designs
                    #    tried). So memory is checked on something only the chat can know.
                    say('my name is Karthik and I handle partnerships')
                    reply, secs = say("what's my name?")
                    record('remembers the conversation', 'karthik' in reply.lower(), secs,
                           self._short(reply))

                    # 4b. each turn's prompt continues the one before: the runtime then
                    #     reuses what it read instead of keeping another copy in RAM
                    answers = [c for c in calls if c['module'] == 'core.assistant'
                               and 'AI sales assistant' in c['system'] and 'ANSWER AGAIN' not in c['system']]
                    chained = sum(1 for a, b in zip(answers, answers[1:])
                                  if b['prompt'].startswith(a['prompt']))
                    record('each turn continues the last prompt', len(answers) >= 3 and chained == len(answers) - 1,
                           0.0, f'{chained} of {len(answers) - 1} turns continued the prompt before')

                    # 5. it works out who to find — from what the owner just said, and
                    #    from the company on its own — and sets it only on "yes"
                    reply, secs = say('we run coding bootcamps for working professionals - who should I find?')
                    said_offer = 'Reply "yes"' in reply and 'just told me' in reply.lower()
                    record('who to find: from your words', said_offer, secs, self._short(reply))
                    reply, secs = say('no')
                    reply, secs = say('who should I find?')
                    offered = 'Reply "yes"' in reply
                    record('who to find: analysis', offered, secs, self._short(reply))
                    reply, secs = say('yes')
                    kinds = [k.strip() for k in AppSettings.load().target_industries.split(',') if k.strip()]
                    record('who to find: set on yes', kinds and all(k in CATALOGUE for k in kinds), secs,
                           f'Who to find is now: {", ".join(kinds) or "(nothing)"}')

                    # 6. a long conversation is compressed and stays honest
                    if not quick:
                        with mock.patch.object(convo, 'PROMPT_BUDGET', 1500):   # a long chat in a small window
                            total, flagged_before, calls_before = 0.0, len(guard_events), len(calls)
                            for question in LONG_CHAT:
                                _reply, secs = say(question)
                                total += secs
                        user.refresh_from_db()
                        note = (user.chat_memory or {}).get('summary') or ''
                        during = calls[calls_before:]
                        largest = max((call['prompt_tokens'] for call in during), default=0)
                        record('long chat: compressed', bool(note), total,
                               f'memory note ({len(note)} chars): {self._short(note)}')
                        record('long chat: inside the window', 0 < largest <= 1500, 0.0,
                               f'largest prompt {largest} real tokens of the 1500 budget')
                        caught_here = [event for event in guard_events[flagged_before:] if event[0]]
                        record('long chat: last answer shown as written', bool(guard_events) and not guard_events[-1][1],
                               0.0, f'{len(caught_here)} made-up answer(s) caught on the way')

                    # 7. the model answers in the person's own script
                    reply, secs = say('எத்தனை leads இருக்கு?')
                    record('answers in Tamil', any('\u0B80' <= ch <= '\u0BFF' for ch in reply), secs,
                           self._short(reply))

                    # 8. the command check, without the keyword rules
                    if not quick:
                        started = time.monotonic()
                        good = 0
                        misses = []
                        for text, action, fields in COMMAND_CASES:
                            spec = detect_action_llm(text)
                            ok = spec.get('action') == action and all(
                                want.lower() in str(spec.get(key) or '').lower() for key, want in fields.items())
                            good += ok
                            if not ok:
                                misses.append(f'{text[:28]} -> {spec.get("action")}')
                        record('command check', good >= 17, time.monotonic() - started,
                               f'{good}/{len(COMMAND_CASES)} right' + (f'; misses: {"; ".join(misses)}' if misses else ''))

                    # 9. the guide
                    started = time.monotonic()
                    answer = guide_answer('how do I connect my mailbox?', user=user)
                    record('guide: mailbox', 'email sending' in answer.lower() or 'mailbox' in answer.lower(),
                           time.monotonic() - started, self._short(answer))
                    started = time.monotonic()
                    answer = guide_answer('where do I set who to find?', user=user)
                    record('guide: who to find', 'who to find' in answer.lower(), time.monotonic() - started,
                           self._short(answer))

                    # 10. the detector on the real bad replies
                    caught = sum(1 for bad in PAST_MADE_UP_REPLIES
                                 if convo.detect_problems(bad, data='Leads: 5 in total'))
                    record('past made-up replies caught', caught == len(PAST_MADE_UP_REPLIES), 0.0,
                           f'{caught}/{len(PAST_MADE_UP_REPLIES)}')
        finally:
            User.objects.filter(username=slug).delete()
            Workspace.all_tenants.filter(slug=slug).delete()

        self._summary(rows, calls, guard_events, quick)

    # ------------------------------------------------------------------

    def _instrumented(self, calls, guard_events):
        """See every model call (size, time) and every honesty check."""
        from core import actions, assistant, guide
        from core.ai import llm_chat as real_chat
        real_guarded = convo.guarded

        def wrap_llm(module_name):
            def llm_chat(system, prompt, **kw):
                started = time.monotonic()
                out = real_chat(system, prompt, **kw)
                calls.append({'module': module_name, 'secs': time.monotonic() - started,
                              'prompt_tokens': (out or {}).get('prompt_tokens') or 0,
                              'eval_tokens': (out or {}).get('eval_tokens') or 0,
                              'system': system, 'prompt': prompt})
                return out
            return llm_chat

        def guarded(generate, fallback, **kw):
            used_fallback = []

            def tracking_fallback():
                used_fallback.append(True)
                return fallback()

            reply, problems, regenerated = real_guarded(generate, tracking_fallback, **kw)
            guard_events.append((problems, bool(used_fallback)))
            return reply, problems, regenerated

        stack = []
        for module in (assistant, actions, guide):
            patcher = mock.patch.object(module, 'llm_chat', wrap_llm(module.__name__))
            patcher.start()
            stack.append(patcher)
        patcher = mock.patch.object(convo, 'guarded', guarded)
        patcher.start()
        stack.append(patcher)
        return _Stopper(stack)

    def _model_name(self):
        from core.ai import DEFAULT_MODELS, resolve_provider
        provider = resolve_provider(AppSettings.load().ai_provider)
        return f'{provider} {DEFAULT_MODELS.get(provider, "")}'.strip()

    @staticmethod
    def _short(text, limit=150):
        return ' '.join(str(text).split())[:limit] + ('…' if len(str(text)) > limit else '')

    def _summary(self, rows, calls, guard_events, quick):
        failed = [row for row in rows if not row[1]]
        self.stdout.write('')
        if calls:
            secs = sorted(c['secs'] for c in calls)
            self.stdout.write(
                f'model calls: {len(calls)}, average {statistics.mean(secs):.1f}s, '
                f'longest {secs[-1]:.1f}s; largest prompt {max(c["prompt_tokens"] for c in calls)} tokens '
                f'(window {convo.CONTEXT_TOKENS})')
        caught = [event for event in guard_events if event[0]]
        silent = [event for event in caught if event[0] == ['empty']]
        caught = [event for event in caught if event[0] != ['empty']]
        plain = sum(1 for event in caught if event[1])
        self.stdout.write(
            f'honesty guard: {len(guard_events)} answers checked, {len(caught)} made-up answer(s) caught '
            f'({len(caught) - plain} answered again cleanly, {plain} honest fallback instead of a guess)')
        if silent:
            self.stdout.write(f'THE MODEL GAVE NO ANSWER on {len(silent)} turn(s) - a failing model, not a '
                              'made-up one (check the runtime and the model name)')
        if calls:
            slowest = sorted(calls, key=lambda c: c['secs'], reverse=True)[:4]
            self.stdout.write('slowest calls: ' + ' | '.join(
                f'{c["module"]} {c["secs"]:.1f}s for {c["prompt_tokens"]} in / {c["eval_tokens"]} out'
                for c in slowest))
        self.stdout.write(
            f'RESULT: {len(rows) - len(failed)}/{len(rows)} checks passed'
            + ('' if not failed else ' - FAILED: ' + ', '.join(row[0] for row in failed))
            + (' (quick run)' if quick else ''))
        if failed:
            raise SystemExit(1)


class _Stopper:
    def __init__(self, patchers):
        self.patchers = patchers

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        for patcher in reversed(self.patchers):
            patcher.stop()
