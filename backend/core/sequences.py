"""Follow-up sequences — after a cold email is SENT the lead is enrolled in
the workspace's default Sequence; its later steps are materialized when due.

  * email step     → EmailDraft(status=draft) threaded under the cold email
                     ("Re: <subject>", In-Reply-To/References), same mailbox.
                     Waits for approval unless followups_auto_approve is on,
                     then outbox.enqueue_draft() — the outbox still paces it.
  * whatsapp step  → WhatsAppMessage(status=draft) when the sidecar is on
                     (ALWAYS needs approval), else a wa.me OutreachTask.
  * linkedin_task  → OutreachTask with a LinkedIn search URL + a ≤300-char
                     note to paste.  LinkedIn is never automated.
  * call_task      → OutreachTask with the phone number.

Stop rules (stop_enrollment, atomic): any human reply (out-of-office only
shifts next_due_at), a hard bounce, unsubscribe/suppression, lead won/lost or
"do not contact", or a manual stop.  Every not-yet-sent item of the enrollment
is rejected, and mailer.send_draft / whatsapp.send_message re-check the
enrollment right before sending (a reply racing a queued follow-up wins)."""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import (AppSettings, EmailDraft, Enrollment, Lead, OutreachTask, Sequence, SequenceStep,
                     Suppression, WhatsAppMessage)

log = logging.getLogger(__name__)

E_ = Enrollment.Statuses
D_ = EmailDraft.Statuses
CH = SequenceStep.Channels
STOPPED_ERROR = 'Follow-ups stopped for this lead — this message was not sent.'
OOO_SHIFT = timedelta(days=3)
LINKEDIN_NOTE_MAX = 300

DEFAULT_SEQUENCE_NAME = 'Standard follow-up'
# (order, channel, delay_days, enabled, subject, body)
DEFAULT_STEPS = (
    (1, CH.EMAIL, 3, True, '',
     'Hi {{company}} team,\n\nJust bumping this up in case it got buried. Would a short '
     'call this week be useful? Happy to share the ideas I mentioned.\n\n{{sender_name}}'),
    (2, CH.EMAIL, 4, True, '',
     "Hi {{company}} team,\n\nI haven't heard back, so I'll assume the timing isn't right "
     "and close the loop for now. If it becomes a priority later, just reply to this "
     "email and I'll pick it up.\n\nThanks,\n{{sender_name}}"),
    (3, CH.LINKEDIN_TASK, 1, False, '',
     'Hi, I emailed {{company}} recently about a few quick wins for {{website}}. '
     'Happy to connect here. {{sender_name}}'),
    (4, CH.WHATSAPP, 2, False, '',
     'Hi, this is {{sender_name}}. I emailed {{company}} a few ideas for {{website}} — '
     'is this the right number to share them? Reply STOP and I will not message again.'),
    (5, CH.CALL_TASK, 2, False, '',
     'Call {{company}} about the email from {{sender_name}}.'),
)


# ------------------------------------------------------------------
# Sequence setup
# ------------------------------------------------------------------

def create_default_steps(seq):
    for order, channel, delay, enabled, subject, body in DEFAULT_STEPS:
        SequenceStep.objects.create(sequence=seq, order=order, channel=channel, delay_days=delay,
                                    business_days=True, enabled=enabled, subject=subject, body=body)


def ensure_default_sequence():
    """The workspace's default sequence, created lazily (also seeded by a
    data migration)."""
    seq = Sequence.objects.filter(is_default=True).first()
    if seq is None:
        seq = Sequence.objects.create(name=DEFAULT_SEQUENCE_NAME, is_default=True, active=True)
        create_default_steps(seq)
    return seq


def add_delay(start, days, business=True):
    """start + days; business=True counts Mon–Fri only (Asia/Kolkata)."""
    from .outbox import local
    if not business:
        return start + timedelta(days=days)
    d, n = local(start), 0
    while n < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return d


def next_step(enr):
    return (enr.sequence.steps.filter(enabled=True, order__gt=enr.current_step)
            .order_by('order').first())


def schedule_next(enr, from_dt=None):
    """Point the enrollment at its next enabled step, or complete it."""
    from_dt = from_dt or timezone.now()
    step = next_step(enr)
    if step is None:
        Enrollment.objects.filter(pk=enr.pk, status=E_.ACTIVE).update(
            status=E_.COMPLETED, next_due_at=None, pending_step=None, updated_at=timezone.now())
    else:
        Enrollment.objects.filter(pk=enr.pk, status=E_.ACTIVE).update(
            next_due_at=add_delay(from_dt, step.delay_days, step.business_days),
            pending_step=None, updated_at=timezone.now())
    enr.refresh_from_db()
    return step


# ------------------------------------------------------------------
# Enrollment + progress (called from mailer.send_draft after SENT)
# ------------------------------------------------------------------

def _blocked_lead(lead):
    if lead is None or lead.do_not_contact:
        return True
    from .models import Potential
    return Potential.objects.filter(lead=lead, stage__in=[Potential.Stages.WON,
                                                          Potential.Stages.LOST]).exists()


def enroll_after_send(draft):
    """A cold email just went out → enroll its lead in the default sequence
    (Settings → Follow-ups on).  Idempotent; never raises to the caller."""
    if draft.enrollment_id or (draft.in_reply_to or '').strip() or not draft.lead_id:
        return None
    s = AppSettings.load()
    if not s.followups_enabled or _blocked_lead(draft.lead):
        return None
    if Enrollment.objects.filter(lead_id=draft.lead_id, status__in=[E_.ACTIVE, E_.PAUSED]).exists():
        return None
    seq = ensure_default_sequence()
    if not seq.active:
        return None
    enr = Enrollment.objects.create(lead_id=draft.lead_id, sequence=seq, current_step=0,
                                    first_draft=draft, last_message_id=draft.message_id or '')
    EmailDraft.objects.filter(pk=draft.pk).update(enrollment=enr, sequence_step=0)
    draft.enrollment_id, draft.sequence_step = enr.pk, 0
    schedule_next(enr, draft.sent_at or timezone.now())
    return enr


def after_send(draft):
    """Hook for every SENT email: enroll a cold email, advance a follow-up."""
    try:
        if draft.enrollment_id and draft.sequence_step > 0:
            enr = Enrollment.objects.filter(pk=draft.enrollment_id).first()
            if enr is None:
                return
            Enrollment.objects.filter(pk=enr.pk).update(
                current_step=max(enr.current_step, draft.sequence_step),
                last_message_id=draft.message_id or enr.last_message_id)
            enr.refresh_from_db()
            if enr.status == E_.ACTIVE:
                schedule_next(enr, draft.sent_at or timezone.now())
        else:
            enroll_after_send(draft)
    except Exception as exc:  # sequences must never break sending
        log.warning('Sequence update after send failed for draft %s: %s', draft.pk, exc)


def enrollment_allows_send(enrollment_id):
    """Last check right before a follow-up leaves (send path)."""
    enr = Enrollment.objects.select_related('lead').filter(pk=enrollment_id).first()
    return bool(enr and enr.status == E_.ACTIVE and not _blocked_lead(enr.lead))


# ------------------------------------------------------------------
# Stop rules
# ------------------------------------------------------------------

def stop_enrollment(enr, reason, now=None):
    """Atomic stop: status → stopped and every unsent item rejected.
    Returns True when this call stopped it."""
    now = now or timezone.now()
    pk = enr.pk if hasattr(enr, 'pk') else enr
    with transaction.atomic():
        stopped = Enrollment.objects.filter(pk=pk, status__in=[E_.ACTIVE, E_.PAUSED]).update(
            status=E_.STOPPED, stop_reason=reason[:200], stopped_at=now, next_due_at=None,
            pending_step=None, updated_at=now)
        EmailDraft.objects.filter(enrollment_id=pk, sequence_step__gt=0,
                                  status__in=[D_.DRAFT, D_.QUEUED, D_.FAILED]).update(
            status=D_.REJECTED, error=STOPPED_ERROR, updated_at=now)
        W = WhatsAppMessage.Statuses
        WhatsAppMessage.objects.filter(enrollment_id=pk, status__in=[W.DRAFT, W.QUEUED, W.FAILED]).update(
            status=W.REJECTED, error=STOPPED_ERROR, updated_at=now)
        OutreachTask.objects.filter(enrollment_id=pk, status=OutreachTask.Statuses.OPEN).update(
            status=OutreachTask.Statuses.SKIPPED, updated_at=now)
    return bool(stopped)


def _live():
    return Enrollment.objects.filter(status__in=[E_.ACTIVE, E_.PAUSED])


def stop_for_lead(lead_id, reason):
    return sum(stop_enrollment(e, reason) for e in _live().filter(lead_id=lead_id))


def stop_for_email(email, reason):
    email = (email or '').strip()
    if not email:
        return 0
    qs = _live().filter(Q(lead__contact_email__iexact=email) | Q(first_draft__to_email__iexact=email)
                        | Q(drafts__to_email__iexact=email)).distinct()
    return sum(stop_enrollment(e, reason) for e in qs)


def stop_for_phone(phone):
    from .whatsapp import normalize_phone
    n = 0
    for e in _live().select_related('lead').exclude(lead__contact_phone=''):
        if normalize_phone(e.lead.contact_phone, e.lead.country, e.lead.state) == phone:
            n += stop_enrollment(e, 'Opted out of WhatsApp')
    return n


def on_reply(reply):
    """Inbox created a Reply: a human answer stops follow-ups; an
    out-of-office pushes the next step back a few days."""
    from .models import Reply
    lead_id = reply.lead_id or (reply.draft.lead_id if reply.draft_id else None)
    qs = _live().filter(lead_id=lead_id) if lead_id else Enrollment.objects.none()
    if reply.classification != Reply.Classes.OUT_OF_OFFICE and not lead_id and reply.from_email:
        return stop_for_email(reply.from_email, 'They replied')
    if reply.classification == Reply.Classes.OUT_OF_OFFICE:
        for e in qs.filter(status=E_.ACTIVE, next_due_at__isnull=False):
            Enrollment.objects.filter(pk=e.pk, status=E_.ACTIVE).update(
                next_due_at=max(e.next_due_at, timezone.now()) + OOO_SHIFT)
        return 0
    return sum(stop_enrollment(e, 'They replied') for e in qs)


# ------------------------------------------------------------------
# Materializing due steps
# ------------------------------------------------------------------

def render(text, lead, s):
    from .pipeline import _fill_template
    return _fill_template(text or '', lead, s, (lead.findings or [])[:3]).strip()


def personalize(text, lead, channel):
    """Optional LLM polish of a follow-up; keeps the template on any failure."""
    from .ai import llm_available, llm_complete
    if not llm_available():
        return text
    prompt = (f'Rewrite this short sales follow-up ({channel}) to {lead.company} so it reads '
              f'natural and personal. Keep it as short, same meaning, no new claims, no subject '
              f'line. About them: {(lead.description or "")[:400]}\n\n---\n{text}')
    out = (llm_complete(prompt, temperature=0.4) or '').strip()
    return out or text


def linkedin_search_url(lead):
    from urllib.parse import quote
    return 'https://www.linkedin.com/search/results/people/?keywords=' + quote(lead.company)


def _thread_ids(enr):
    ids = [m for m in enr.drafts.filter(status=D_.SENT).exclude(message_id='')
           .order_by('sent_at', 'id').values_list('message_id', flat=True)]
    if enr.first_draft_id and enr.first_draft.message_id and enr.first_draft.message_id not in ids:
        ids.insert(0, enr.first_draft.message_id)
    return ids


def _email_step(enr, step, lead, s, body):
    from .inbox import reply_subject
    first = enr.first_draft
    to = (first.to_email if first else '') or lead.contact_email
    if not to or Suppression.is_suppressed(to):
        stop_enrollment(enr, 'Address unsubscribed or bounced')
        return None
    subject = render(step.subject, lead, s) if step.subject else reply_subject(first.subject if first else '')
    refs = _thread_ids(enr)
    in_reply_to = enr.last_message_id or (refs[-1] if refs else '')
    draft = EmailDraft.objects.create(
        lead=lead, company=lead.company, to_email=to, subject=subject[:300], body=body,
        status=D_.DRAFT, enrollment=enr, sequence_step=step.order,
        mailbox=first.mailbox if first else None, in_reply_to=in_reply_to,
        references=' '.join(refs))
    if s.followups_auto_approve:
        from .outbox import enqueue_draft
        enqueue_draft(draft.pk, prefer_mailbox=draft.mailbox)
    return draft


def _task(enr, lead, channel, message, url='', phone=''):
    return OutreachTask.objects.create(lead=lead, enrollment=enr, channel=channel, message=message,
                                       url=url, phone=phone, due_at=timezone.now())


def _whatsapp_step(enr, lead, s, body):
    from . import whatsapp
    phone = whatsapp.normalize_phone(lead.contact_phone, lead.country, lead.state)
    if not phone or Suppression.is_phone_suppressed(phone):
        return None
    if s.whatsapp_enabled:  # sidecar: still needs a human approval, every time
        return WhatsAppMessage.objects.create(lead=lead, enrollment=enr, company=lead.company,
                                              to_phone=phone, text=body)
    return _task(enr, lead, OutreachTask.Channels.WHATSAPP, body,
                 url=whatsapp.wa_me_link(phone, body), phone=phone)


def materialize(enr, now=None):
    """Create the item for the enrollment's due step.  The conditional UPDATE
    on pending_step makes two workers racing on the same step create one item."""
    now = now or timezone.now()
    step = next_step(enr)
    if step is None:
        return schedule_next(enr, now)
    if not Enrollment.objects.filter(pk=enr.pk, status=E_.ACTIVE, pending_step__isnull=True,
                                     next_due_at__lte=now).update(pending_step=step.order,
                                                                  next_due_at=None, updated_at=now):
        return None
    enr.refresh_from_db()
    lead = enr.lead
    if _blocked_lead(lead):
        stop_enrollment(enr, 'Lead closed or marked do-not-contact')
        return None
    s = AppSettings.load()
    body = render(step.body, lead, s)
    if step.personalize and body:
        body = personalize(body, lead, step.channel)
    item = None
    if step.channel == CH.EMAIL:
        item = _email_step(enr, step, lead, s, body)
        if item is not None:
            return item  # advances when sent (after_send) or rejected (tick)
    elif step.channel == CH.WHATSAPP:
        item = _whatsapp_step(enr, lead, s, body)
    elif step.channel == CH.LINKEDIN_TASK:
        item = _task(enr, lead, OutreachTask.Channels.LINKEDIN, body[:LINKEDIN_NOTE_MAX],
                     url=linkedin_search_url(lead))
    elif step.channel == CH.CALL_TASK and lead.contact_phone:
        item = _task(enr, lead, OutreachTask.Channels.CALL, body, phone=lead.contact_phone,
                     url='tel:' + ''.join(c for c in lead.contact_phone if c.isdigit() or c == '+'))
    # assisted / WhatsApp / skipped steps don't block the email chain
    _finish_step(enr, step.order, now)
    return item


def _finish_step(enr, order, now):
    Enrollment.objects.filter(pk=enr.pk, status=E_.ACTIVE).update(
        current_step=max(enr.current_step, order), pending_step=None)
    enr.refresh_from_db()
    if enr.status == E_.ACTIVE:
        schedule_next(enr, now)


def tick(now=None):
    """One pass for the ACTIVE workspace (worker thread, ~30 s): unblock
    email steps whose draft was rejected, then materialize due steps."""
    now = now or timezone.now()
    made = 0
    for enr in Enrollment.objects.filter(status=E_.ACTIVE, pending_step__isnull=False):
        d = enr.drafts.filter(sequence_step=enr.pending_step).order_by('-id').first()
        if d is None or d.status == D_.REJECTED:
            _finish_step(enr, enr.pending_step, now)  # user skipped this follow-up
    for enr in Enrollment.objects.filter(status=E_.ACTIVE, pending_step__isnull=True,
                                         next_due_at__lte=now).select_related('lead', 'sequence'):
        try:
            if materialize(enr, now) is not None:
                made += 1
        except Exception as exc:
            log.warning('Sequence step failed for enrollment %s: %s', enr.pk, exc)
    return made


def tick_all_workspaces():
    from .models import Workspace
    from .tenancy import workspace_context
    for ws in Workspace.all_tenants.filter(is_active=True).order_by('id'):
        try:
            with workspace_context(ws):
                tick()
        except Exception as exc:
            log.warning('Sequence tick failed [%s]: %s', ws.slug, exc)


# ------------------------------------------------------------------
# Signals — stop rules fire wherever the row is written (inbox, unsubscribe
# endpoint, admin, API).  Connected in CoreConfig.ready().
# ------------------------------------------------------------------

def _on_reply_saved(sender, instance, created, **kwargs):
    if created:
        try:
            on_reply(instance)
        except Exception as exc:
            log.warning('Sequence stop on reply %s failed: %s', instance.pk, exc)


def _on_suppression_saved(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.email:
        stop_for_email(instance.email, f'Address {instance.get_reason_display().lower()}')
    # a phone (WhatsApp) opt-out only blocks WhatsApp: whatsapp steps skip it and
    # the opt-out endpoint rejects pending messages; email follow-ups continue


def _on_potential_saved(sender, instance, **kwargs):
    from .models import Potential
    if instance.lead_id and instance.stage in (Potential.Stages.WON, Potential.Stages.LOST):
        stop_for_lead(instance.lead_id, f'Deal marked {instance.get_stage_display().lower()}')


def _on_lead_saved(sender, instance, **kwargs):
    if instance.do_not_contact:
        stop_for_lead(instance.pk, 'Marked do-not-contact')


def connect_signals():
    from django.db.models.signals import post_save

    from .models import Potential, Reply
    post_save.connect(_on_reply_saved, sender=Reply, dispatch_uid='seq_reply')
    post_save.connect(_on_suppression_saved, sender=Suppression, dispatch_uid='seq_suppression')
    post_save.connect(_on_potential_saved, sender=Potential, dispatch_uid='seq_potential')
    post_save.connect(_on_lead_saved, sender=Lead, dispatch_uid='seq_lead')
