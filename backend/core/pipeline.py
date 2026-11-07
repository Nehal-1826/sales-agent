"""
The autonomous pipeline — orchestrator dispatching the agents from the notes:

    USER → ORCHESTRATOR → SEARCH (SCRAPE) → PROFILE → COPYWRIGHT
                       → RESPONDER (CHATBOT) → LOOP back to SEARCH

Real implementation:
    SEARCH      free multi-engine web discovery (DuckDuckGo, Brave, Mojeek, …) +
                Google Maps, industry × region rotation
    PROFILE     scrapes each lead's site, categorizes website / no-website,
                extracts contact email, produces flaw findings + potential score
    COPYWRIGHT  drafts a personalized cold email per lead (LLM when an AI key
                is configured, strong template otherwise) → EmailDraft(draft)
    RESPONDER   reports the outreach queue; humans approve → mailer sends
"""

import json
import logging
import os
import random
import re
import threading
import time
from contextvars import ContextVar
from datetime import timedelta

from django.db.models import Q
from django.db.models.functions import Lower, Trim
from django.utils import timezone

from .ai import llm_available, llm_complete
from .apify_maps import apify_available as apify_maps_available
from .apify_maps import enrich_leads_via_apify
from .enrichment import apollo_enrich_domain
from .maps_funnel import ai_fit_batch, nlp_prefilter
from .gmaps import (
    discover_no_website_places, discover_places_with_website, enrich_leads_via_gmaps, gmaps_available,
)
from .health import status_of
from .icp import agency_mode, buyer_industries, looks_like_competitor, our_services_text, vertical
from .models import (AgentConfig, AppSettings, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential,
                     Suppression)
from .discovery import QUERIES_HARD_CAP, expand_queries, last_discovery_stats, next_widen_level
from .runlock import acquire_run_lock, heartbeat_run_lock, release_run_lock, running_since
from .search_backends import cycle_stats, engine_label, reset_cycle_stats
from .scalelist import scalelist_phone_find
from .tenancy import current_workspace, workspace_context
from .scraper import (
    _registrable,
    analyze_website,
    region_from_query,
    search_companies,
    search_queries_for_cycle,
)
from .scraper import search_query_for_cycle  # noqa: F401 — re-exported for scripts/tests

log = logging.getLogger(__name__)

MAX_LEADS_PER_CYCLE = 100     # new companies discovered per cycle (across all region queries)
MAX_PROFILE_PER_CYCLE = 100   # sites scraped+audited per cycle
MAX_DRAFTS_PER_CYCLE = 100    # cold emails drafted per cycle
APOLLO_SWEEP_PER_CYCLE = 5   # phone-enrichment retries per cycle (quota-friendly)
MAPS_LEADS_PER_CYCLE = 4     # no-website leads per Maps query term
MAPS_QUERIES_PER_CYCLE = 8   # distinct query terms sent to Google Maps per round
MAPS_SITE_LEADS_PER_TERM = 10  # Maps listings WITH a website, per query term
DISCOVERY_QUERIES_PER_CYCLE = 24  # base search slices per round; core.discovery adds variants
DISCOVERY_QUERIES_HARD_CAP = QUERIES_HARD_CAP  # adaptive widening never exceeds this
DISCOVERY_RESULTS_PER_QUERY = 15  # company homepages kept per search query
CYCLE_BUDGET_SECONDS = 35 * 60   # after this a cycle starts no new expensive work
SEARCH_BUDGET_SECONDS = 12 * 60  # the web-search sweep's own share of that budget
HEARTBEAT_EVERY_LEADS = 5        # refresh the run lock every N profiled leads
REPROFILE_AFTER_DAYS = 90        # profiled data older than this is refreshed …
REPROFILE_PER_CYCLE = 5          # … a few leads per cycle
ENRICH_RETRY_HOURS = 72      # paid phone lookups: at most one per lead per this many hours

# the running cycle's lock token (set by run_pipeline / start_pipeline_async)
_LOCK_TOKEN = ContextVar('pipeline_lock_token', default=None)


def _heartbeat():
    """Keep this cycle's run lock fresh (only the owner can refresh it)."""
    token = _LOCK_TOKEN.get()
    if token is None:
        return
    try:
        if not heartbeat_run_lock(token):
            log.warning('Pipeline run lock no longer ours — another cycle took it over')
    except Exception:
        log.exception('Could not refresh the pipeline run lock')


def _out_of_time(deadline):
    return time.monotonic() > deadline


# Score at which Profile flags a POTENTIAL opportunity.
POTENTIAL_THRESHOLD = 65


def _copywright_config():
    cfg = AgentConfig.objects.filter(agent='copywright').first()
    return cfg


def _norm_domain(website):
    """Normalize a website to a comparable domain (no scheme, www or path)."""
    d = (website or '').strip().lower()
    for prefix in ('https://', 'http://'):
        if d.startswith(prefix):
            d = d[len(prefix):]
    d = d.split('/', 1)[0]
    if d.startswith('www.'):
        d = d[4:]
    return d


def _looks_like_company(name):
    """Guard for og:site_name renames — never rename a lead to a challenge
    page title or a sentence like 'One moment, please…'."""
    return not re.search(
        r'one moment|just a moment|attention required|checking your browser|'
        r'verify you are human|index of|not found|40[34]|enable javascript',
        name or '', re.I)


def _ai_review(lead, audit, settings, our_services=''):
    """Gemini reads the lead's own site text and answers two questions in one
    call: is this an actual, relevant business — and what does it do?

    Returns (relevant, description).  relevant is:
      True   → genuine, industry-relevant business — keep it
      False  → blog/directory/landing-page junk — the caller deletes the lead
      None   → the AI was configured but could not answer right now (throttle,
               network, bad key) or gave no explicit RELEVANT: yes|no verdict —
               the caller HOLDS the lead unprofiled so the next cycle re-vets it.  Strict mode: an unreviewed site never
               enters the CRM, because unvetted discoveries are where fake
               leads come from.  Without an AI key the fallback is (True, '')
               — keep everything, describe nothing (keyless demo mode; the
               heuristic ICP gate in run_pipeline still filters competitors)."""
    excerpt = (audit.get('analysis') or {}).get('text_excerpt', '')
    if not excerpt or not llm_available():
        return True, ''
    icp_line = ''
    if getattr(settings, 'icp_notes', ''):
        icp_line = (f'OUR IDEAL CLIENT PROFILE (weigh this heavily when deciding): '
                    f'{settings.icp_notes[:800]}\n\n')
    if agency_mode(settings):
        # partnership targeting: agencies ARE the prospect — vetting only
        # rejects non-businesses (blogs, directories, huge corporations),
        # never "they sell the same services we do"
        goal_rule = (
            'We are an engineering team looking for boutique digital agencies and '
            'software shops as PROJECT PARTNERS — a company that designs, builds or '
            'markets software/websites for clients is EXACTLY the prospect we want, '
            'never a rejection reason.')
    else:
        goal_rule = (
            'We sell CUSTOM SAAS ENGINEERING: complete SaaS platforms, marketplaces, '
            'internal tools and mobile apps built for businesses.')
    prompt = (
        f'You are vetting a sales-prospect lead discovered while searching for a '
        f'"{lead.industry or "business"}" (website: {lead.website}). {goal_rule}\n'
        f'{icp_line}'
        f'--- SITE TEXT ---\n{excerpt}\n--- END SITE TEXT ---\n\n'
        f'Answer in EXACTLY this format:\n'
        f'RELEVANT: yes|no\n'
        f'DESCRIPTION: <2-3 plain sentences: what does this company do, who are its '
        f'customers, what is its main offer>\n\n'
        f'Rules for RELEVANT: "no" only when the site is clearly NOT a real operating '
        f'business (blog post, news article, directory/listing, personal portfolio, '
        f'parked page, product of a huge corporation) OR is completely unrelated to '
        f'{lead.industry or "the industry we searched"}. '
        f'A real small/mid company in a closely related field is "yes". '
        f'Use only what the text shows. No markdown.'
    )
    try:
        text = llm_complete(
            prompt,
            system='You vet sales leads accurately and conservatively from website text.',
            temperature=0)  # deterministic verdicts — no creative randomness
        if not text:
            return None, ''  # strict: hold for re-vetting instead of passing unvetted
        verdict = re.search(r'RELEVANT\W*\s*(yes|no)\b', text, re.I)
        if not verdict:
            return None, ''   # no clear verdict (refusal, garbled) → hold, never admit
        relevant = verdict.group(1).lower() == 'yes'
        m = re.search(r'DESCRIPTION:\s*(.+)', text, re.S)
        description = (m.group(1).strip().split('---')[0].strip() if m else '')
        description = ' '.join(description.split())[:600]
        return relevant, description
    except Exception as exc:
        log.warning('AI review failed for %s: %s', lead.company, exc)
        return None, ''


def _enrich_due(lead):
    tried = (lead.analysis or {}).get('enrich_tried_at')
    if not tried:
        return True
    try:
        last = timezone.datetime.fromisoformat(tried)
    except (TypeError, ValueError):
        return True
    return timezone.now() - last >= timezone.timedelta(hours=ENRICH_RETRY_HOURS)


def _profiled_at(lead):
    """When the lead's audit was last done: analysis.profiled_at, else (older
    leads, stamped before this field existed) its last update."""
    stamp = (lead.analysis or {}).get('profiled_at')
    if stamp:
        try:
            from datetime import datetime  # noqa: PLC0415
            return datetime.fromisoformat(stamp)
        except ValueError:
            pass
    return lead.updated_at


def reprofile_candidates(limit=REPROFILE_PER_CYCLE):
    """Profiled website leads whose audit is older than REPROFILE_AFTER_DAYS
    and who were never emailed (no SENT draft) — oldest first, bounded."""
    cutoff = timezone.now() - timedelta(days=REPROFILE_AFTER_DAYS)
    sent = EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT,
                                     lead__isnull=False).values('lead_id')
    # updated_at >= profiled_at, so this prefilter never drops a stale audit
    pool = (Lead.objects.filter(profiled=True, updated_at__lt=cutoff)
            .exclude(website='').exclude(pk__in=sent).order_by('updated_at')[:limit * 4])
    out = [lead for lead in pool if _profiled_at(lead) < cutoff]
    return out[:limit]


def _reprofile(lead):
    """Refresh an old audit in place.  No gates, no deletion, no new drafts:
    the lead already passed vetting; only site-derived data is refreshed and
    contact fields are only FILLED, never overwritten (a draft may use them).
    Copywright still skips any lead that has drafts (rejected stays rejected)."""
    audit = analyze_website(lead.company, lead.website, prefer_country=lead.country)
    if not audit.get('analysis') and not audit.get('findings'):
        return False
    fields = ['findings', 'score', 'has_website', 'analysis', 'updated_at']
    lead.has_website = audit['has_website']
    lead.findings = audit['findings']
    lead.score = audit['score']
    lead.analysis = {**(lead.analysis or {}), **(audit['analysis'] or {}),
                     'profiled_at': timezone.now().isoformat(),
                     'reprofiled': int((lead.analysis or {}).get('reprofiled', 0)) + 1}
    if not lead.contact_email and audit.get('contact_email'):
        lead.contact_email = audit['contact_email']
        fields.append('contact_email')
    if not lead.contact_phone and audit.get('contact_phone'):
        lead.contact_phone = audit['contact_phone']
        fields.append('contact_phone')
    lead.save(update_fields=fields)
    return True


def _paid_lookup_configured():
    """True when at least one paid phone provider (Scalelist / Apollo) has a key."""
    cfg = AppSettings.load()
    return bool(cfg.scalelist_api_key or cfg.apollo_api_key)


def _paid_phone_lookup(lead):
    """Scalelist → Apollo, only for vetted leads, at most once per
    ENRICH_RETRY_HOURS — paid credits are never spent on leads that the
    gates delete, or re-spent every cycle on the same leads.  The stamp is
    only written when a paid call is genuinely made: with no provider key
    nothing was tried, so the lead must not be skipped later."""
    if lead.contact_phone or not _enrich_due(lead) or not _paid_lookup_configured():
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


def _default_template():
    """The user's email template: the flagged default, else the newest."""
    return EmailTemplate.objects.filter(is_default=True).first() or EmailTemplate.objects.first()


TEMPLATE_VARS = ('company', 'industry', 'website', 'description',
                 'findings', 'sender_name', 'sender_website', 'services')

# Real shipped products — the credibility block for partnership outreach
# (agency mode).  Keep verbatim; these are live URLs we stand behind.
SHIPPED_WORK = (
    '- julex.shop — full e-commerce build\n'
    '- ijrnexus.com — academic journal publishing platform\n'
    '- sashainfinity.com — custom web platform\n'
    '- TaraLash Academy — beauty & education platform')


def _fill_template(text, lead, settings, top_findings):
    """Substitute {{placeholders}} in a user template — used when no AI key
    is set, and as the pre-filled base handed to Gemini otherwise."""
    bullets = '\n'.join(f'• {f["issue"]} → {f["recommendation"]}' for f in top_findings) or \
        '• a few on-page improvements worth making'
    values = {
        'company': lead.company,
        'industry': lead.industry or 'your industry',
        'website': lead.website or '(no website found)',
        'description': lead.description or f'a {" ".join(lead.company.lower().split()[:2])} business',
        'findings': bullets,
        'sender_name': settings.company_name or 'our team',
        'sender_website': settings.company_website or '',
        'services': ', '.join(settings.services or []) or 'custom SaaS platform & mobile app engineering',
    }
    for var in TEMPLATE_VARS:
        text = text.replace('{{' + var + '}}', values[var])
    return text


def _draft_email(lead):
    """Copywright agent: personalized cold email for one lead.

    Personalization sources, best first: the user's email template (Settings →
    Email Templates) + the AI description read from the lead's site, merged by
    Gemini; plain placeholder substitution when no AI key is set; the built-in
    heuristic template as the last resort.

    Returns (subject, body, used_llm)."""
    settings = AppSettings.load()
    cfg = _copywright_config()
    our_name = settings.company_name or 'the team'
    our_site = settings.company_website
    services = ', '.join(settings.services or []) or 'custom SaaS platform & mobile app engineering'

    top = lead.findings[:3]
    template = _default_template()
    agency = agency_mode(settings)

    subject = ''
    body = ''
    used_llm = False
    if llm_available():
        system = (cfg.system_prompt if cfg and cfg.system_prompt else
                  'You are an expert B2B cold-email copywriter. Be concise, specific, human. '
                  'No hype, no empty flattery, no attachments.')
        negative = cfg.negative_prompt if cfg else ''
        what_they_do = (f'WHAT THEY DO (read from their site): {lead.description}\n'
                        if lead.description else '')
        template_block = ''
        if template:
            template_block = (
                f'BASE TEMPLATE from the user — keep its structure, tone and ask, '
                f'personalize every line with the lead specifics below '
                f'(placeholders are already pre-filled):\n'
                f'SUBJECT: {_fill_template(template.subject, lead, settings, top)}\n\n'
                f'{_fill_template(template.body, lead, settings, top)}\n\n'
            )
        if agency:
            # partnership pitch — peer agencies are the prospect, never audit them
            goal_and_rules = (
                f'GOAL: win PROJECT PARTNERSHIP — the prospect is a boutique agency / software '
                f'shop that could hand us builds (overflow work, white-label, outside their stack). '
                f'This is a peer-to-peer pitch.\n'
                f'OUR SHIPPED WORK (use at most two, verbatim):\n{SHIPPED_WORK}\n'
                f'OUR TERMS: MVPs in 8–14 weeks, fixed quotes and timelines, full IP handover — '
                f'their client stays theirs. Offer a small paid pilot as proof.\n'
                f'Rules: reference what they do; offer partnership + pilot; one clear ask '
                f'(15-minute call, or invite a "send cases" reply); no pricing.'
            )
        else:
            # high-level buyer pitch — we build their product, never nitpick their site
            goal_and_rules = (
                f'GOAL: win a CUSTOM SAAS BUILD — the prospect is a business that could own '
                f'its own software platform (SaaS product, marketplace, internal tool, client '
                f'portal or mobile app) instead of renting generic tools. We are senior '
                f'product engineers, NOT a website/SEO shop: NEVER mention website flaws, '
                f'SEO, meta tags, performance or design critiques — talk products, not pages.\n'
                f'OUR SHIPPED WORK (use at most two, verbatim):\n{SHIPPED_WORK}\n'
                f'OUR TERMS: fixed quote and timeline, MVP live in 8–14 weeks, full IP '
                f'handover — the client owns the code and the repo.\n'
                f'Rules: open with something true about THEIR business (from what they do); '
                f'pitch ONE concrete software product we could build for them (be specific '
                f'to their industry); one clear ask (15-minute call to walk through a build '
                f'plan); no pricing; no audit language; max 150 words.'
            )
        prompt = (
            f'Write a short cold outreach email (max 150 words).\n\n'
            f'PROSPECT: {lead.company} ({lead.industry or "unknown industry"}), website: '
            f'{lead.website or "NONE FOUND"}\n'
            f'{what_they_do}'
            f'WE (sender): {our_name} — {services}. Website: {our_site or "n/a"}\n'
            + (f'OUR IDEAL CLIENT (tailor the pitch to exactly this): '
               f'{settings.icp_notes[:600]}\n' if getattr(settings, 'icp_notes', '') else '')
            + f'\n'
            f'{template_block}'
            f'{goal_and_rules}\n'
            f'{"Avoid: " + negative if negative else ""}\n\n'
            f'Respond in EXACTLY this format:\n'
            f'SUBJECT: <subject line>\n\n<email body>'
        )
        text = llm_complete(prompt, system=system, model=(cfg.model if cfg else ''))
        if text:
            used_llm = True
            m = text.split('SUBJECT:', 1)
            if len(m) == 2:
                rest = m[1].strip().split('\n', 1)
                subject = rest[0].strip()[:290]
                body = (rest[1] if len(rest) > 1 else '').strip()
            else:
                subject, body = '', text.strip()
            body = body.replace('```', '').strip()

    if not subject or not body:
        if template:
            # user template + placeholders — no AI needed
            subject = _fill_template(template.subject or 'Quick idea for {{company}}',
                                     lead, settings, top)
            body = _fill_template(template.body, lead, settings, top)
        elif agency:
            # agency-mode built-in — partnership pitch, never an audit
            subject = f'Project partnership — {lead.company} × {our_name}'
            body = (
                f'Hi {lead.company} team,\n\n'
                f'We\'re {our_name} — we build SaaS platforms, web apps, and mobile apps, '
                f'and we\'re looking to partner with agencies like yours on project work.\n\n'
                f'Recent things we\'ve shipped:\n{SHIPPED_WORK}\n\n'
                f'MVPs and full builds go live in 8–14 weeks, with fixed quotes, fixed '
                f'timelines, and full IP handover — your client stays yours.\n\n'
                f'The ask: if you have a project coming up — overflow work, a build outside '
                f'your stack, or a client timeline you can\'t staff — we\'d love to take it '
                f'on. Happy to start with a small pilot so you can judge us on real work, '
                f'not a deck.\n\n'
                f'Worth a 15-minute call next week? Or reply "send cases" and I\'ll share '
                f'the details.\n\n'
                f'Best,\n{our_name}\n{our_site}'
            ).strip()
        elif lead.has_website:
            # built-in fallback — custom-SaaS pitch, personalized from their business
            subject = f'A platform for {lead.company} — live in 8–14 weeks'
            body = (
                f'Hi {lead.company} team,\n\n'
                f'I\'m {our_name} from Shailog — we build custom SaaS platforms, marketplaces '
                f'and mobile apps for businesses. You bring the domain expertise'
                f'{" in " + lead.industry if lead.industry else ""}, we own the engineering '
                f'end-to-end.\n\n'
                f'Recent things we\'ve shipped:\n{SHIPPED_WORK}\n\n'
                f'How we work: fixed quote and timeline, MVP live in 8–14 weeks, full IP '
                f'handover — you own the code and the repo.\n\n'
                f'The ask: if there\'s a platform or internal tool you keep wishing existed — '
                f'or an MVP you want in front of users this quarter — I\'ll put together a '
                f'concrete build plan for {lead.company}. Worth a 15-minute call?\n\n'
                f'Best,\n{our_name}\n{our_site}'
            ).strip()
        else:
            subject = f'The software {lead.company} deserves — built in 8–14 weeks'
            body = (
                f'Hi {lead.company} team,\n\n'
                f'I\'m {our_name} from Shailog. We build custom SaaS platforms and mobile '
                f'apps for {"businesses in " + lead.industry if lead.industry else "businesses"} '
                f'— the booking system, client portal or ops platform that off-the-shelf tools '
                f'never quite cover. You run the business, we run the engineering.\n\n'
                f'Recent things we\'ve shipped:\n{SHIPPED_WORK}\n\n'
                f'Fixed quote, fixed timeline, MVP live in 8–14 weeks — and you own the code '
                f'outright.\n\n'
                f'If digitizing {"how " + lead.company + " operates" if lead.company else "your operations"} '
                f'is on your mind this year, I\'ll draft a concrete build plan. Worth a '
                f'15-minute call?\n\n'
                f'Best,\n{our_name}\n{our_site}'
            ).strip()
    return subject, body, used_llm


class PipelineBusy(Exception):
    """Another cycle holds the run lock."""


def run_pipeline(triggered_by='manual'):
    """Run one orchestrator cycle synchronously.  Raises PipelineBusy when a
    cycle is already running anywhere (API, chat, worker)."""
    token = acquire_run_lock()
    if not token:
        raise PipelineBusy('A pipeline cycle is already running.')
    ctx = _LOCK_TOKEN.set(token)
    try:
        return _run_cycle(triggered_by)
    finally:
        _LOCK_TOKEN.reset(ctx)
        try:
            release_run_lock(token)
        except Exception:
            # don't mask the cycle's own exception (or its result) — a stuck
            # lock just expires after runlock.STALE_AFTER
            log.exception('Could not release the pipeline run lock')


def start_pipeline_async(triggered_by='manual'):
    """Take the lock now (so callers can answer 'busy' immediately), run the
    cycle on a daemon thread, release when done.  Returns False when busy."""
    token = acquire_run_lock()
    if not token:
        return False

    # a new thread starts with NO tenant context (ContextVars are not
    # inherited): capture the caller's workspace and re-enter it so the cycle
    # and the lock release both act on this tenant only
    workspace = current_workspace()

    def _target():
        from django.db import connection
        try:
            with workspace_context(workspace):
                _LOCK_TOKEN.set(token)  # fresh thread context — no reset needed
                try:
                    _run_cycle(triggered_by)
                except Exception:
                    log.exception('Background pipeline cycle failed')
                finally:
                    release_run_lock(token)
        finally:
            connection.close()  # thread-local connection — don't leak it

    try:
        threading.Thread(target=_target, name='pipeline-cycle', daemon=True).start()
    except Exception:
        release_run_lock(token)  # no thread will ever run — don't strand the lock
        raise
    return True


def _run_cycle(triggered_by):
    """One orchestrator cycle: Search → Profile → Copywright → Responder.
    Callers hold the run lock (see run_pipeline / start_pipeline_async)."""

    cycle_started = timezone.now()
    deadline = time.monotonic() + CYCLE_BUDGET_SECONDS
    summary = {'agents': [], 'notes': []}
    cycle = PipelineRun.objects.count()

    # --- SEARCH (SCRAPE): real DuckDuckGo discovery, skip known companies --
    # Every cycle searches REGIONS_PER_CYCLE different countries, so the CRM
    # spreads across the world instead of one region at a time — unless the
    # user set target countries (Settings → Lead Targeting), then only those.
    # ICP targeting (core.icp): the industries searched are BUSINESSES THAT
    # BUY what we sell — never our own vertical.  The legacy agency-heavy
    # list used to fill the CRM with the user's own competitors.
    settings = AppSettings.load()
    icp_industries = buyer_industries(settings)
    target_cities = [c.strip() for c in settings.target_cities.split(',') if c.strip()]
    if target_cities:
        summary['notes'].append(
            f'Search: CITY targeting on — sweeping {", ".join(target_cities)} '
            f'for businesses that BUY {our_services_text(settings)}')
    elif agency_mode(settings):
        summary['notes'].append(
            'Search: AGENCY-PARTNER targeting on — searching boutique agencies / software '
            'shops (potential project partners); the competitor filter is off for peers')
    elif not getattr(settings, 'target_industries', ''):
        summary['notes'].append(
            'Search: ICP buyer-targeting on — searching businesses that BUY '
            f'{our_services_text(settings)}; peer/competitor agencies are filtered out')
    base_queries = search_queries_for_cycle(
        cycle,
        n=DISCOVERY_QUERIES_PER_CYCLE,
        regions=[c.strip() for c in settings.target_countries.split(',') if c.strip()],
        industries=icp_industries,
        cities=target_cities,
    )
    # adaptive volume (core.discovery): the last cycle's new-vs-known ratio
    # decides how many phrasing variants / neighbouring cities to add
    widen_level = next_widen_level(last_discovery_stats())
    queries = expand_queries(base_queries, cycle, level=widen_level,
                             cap=DISCOVERY_QUERIES_HARD_CAP)
    reset_cycle_stats()
    search_deadline = time.monotonic() + SEARCH_BUDGET_SECONDS
    results, query_labels = [], []
    for i, (query, industry) in enumerate(queries):
        if _out_of_time(deadline) or time.monotonic() > search_deadline:
            summary['notes'].append(
                f'Search: time budget reached — {len(queries) - i} query(s) left for next cycle')
            break
        if i:
            # engines rotate (core.search_backends), so a short jittered pause
            # is enough to stay polite on the shared IP
            time.sleep(random.uniform(3, 6))
        found = search_companies(query, n=DISCOVERY_RESULTS_PER_QUERY)
        results.extend({'industry': industry, 'query_label': query, **r} for r in found)
        query_labels.append(query)
        engine = (found[0].get('source') if found else None) or '-'
        summary['notes'].append(f'Search: “{query}” → {len(found)} candidates ({engine})')
        if i % 5 == 4:
            _heartbeat()
    summary['query'] = ' | '.join(query_labels)
    _heartbeat()

    known = {_norm_domain(w) for w in Lead.objects.exclude(website='').values_list('website', flat=True)}
    known |= {c.lower() for c in Lead.objects.values_list('company', flat=True)}
    # strict no-fake-data memory: once the AI has rejected a domain, it never
    # gets discovered again — verdicts can flip between runs, memory can't
    known |= {d.lower() for d in (settings.rejected_domains or [])}
    new_leads = []
    profiled_now = []  # pks profiled THIS cycle — scopes the per-cycle Copywright notes
    seen_domains = set()
    known_hits = 0
    per_region_cap = max(2, MAX_LEADS_PER_CYCLE // max(1, len(queries)))  # spread across regions
    taken_per_query = {}
    for r in results:
        if len(new_leads) >= MAX_LEADS_PER_CYCLE:
            break
        domain = _norm_domain(r['website'])
        if not domain:
            continue
        reg = _registrable(domain)
        if reg in seen_domains:
            continue  # same company from another query / engine
        seen_domains.add(reg)
        if domain in known or reg in known or r['name'].lower() in known:
            known_hits += 1
            continue
        query_label = r['query_label']
        if taken_per_query.get(query_label, 0) >= per_region_cap:
            continue  # don't let one region swallow the whole cycle
        taken_per_query[query_label] = taken_per_query.get(query_label, 0) + 1
        state, country = region_from_query(query_label, r['website'])
        lead = Lead.objects.create(
            company=r['name'],
            industry=r['industry'],
            website=r['website'],
            source=f'Search · {engine_label(r.get("source"))} · {query_label}',
            state=state,
            country=country,
            score=random.randint(45, 60),  # provisional, Profile replaces it
            # the SERP snippet feeds the ICP competitor heuristic in Profile
            analysis={'serp_snippet': r.get('snippet', '')},
        )
        new_leads.append(lead)
        summary['notes'].append(f'Search discovered {lead.company} ({lead.website})')
    web_new = len(new_leads)
    sources = cycle_stats()
    hits = ', '.join(f'{engine_label(b)} {n}' for b, n in sorted(sources.items()) if ':' not in b
                     and b != 'exhausted') or 'none'
    misses = sum(n for b, n in sources.items() if b.endswith(':fail'))
    summary['notes'].append(
        f'Search sources: {hits} answered query(s); {misses} engine miss(es) '
        f'(rate-limit/empty → next engine), {sources.get("exhausted", 0)} query(s) with no engine left; '
        f'{len(queries)} queries at widen level {widen_level}: {len(seen_domains)} unique domains → '
        f'{web_new} new, {known_hits} already known')
    discovery_stats = {'widen_level': widen_level, 'queries': len(query_labels),
                       'candidates': len(seen_domains), 'new': web_new,
                       'known': known_hits, 'sources': sources}
    _heartbeat()

    # --- SEARCH (GOOGLE MAPS): no-website local businesses — top leads -----
    # Free keyless Maps scraper (core.gmaps).  A business listed on Maps with
    # no real website is the highest-potential lead for a web-services seller:
    # phone + address from the listing, nothing to audit, everything to build.
    # Skipped in agency mode — a boutique agency without a website is never a
    # project partner; those slots go to real agency discoveries instead.
    if gmaps_available() and not agency_mode(settings) and not _out_of_time(deadline):
        # Maps-first funnel for listings WITH a website: collect → simple NLP →
        # one batched AI fit check → only FIT ones become leads (Profile + drafts follow)
        maps_terms, seen_terms = [], set()
        for q, ind in queries:
            if q not in seen_terms:
                seen_terms.add(q)
                maps_terms.append((q, ind))
        maps_terms = maps_terms[:MAPS_QUERIES_PER_CYCLE]
        site_candidates, industry_of = [], {}
        for maps_query, maps_industry in maps_terms:
            try:
                found = discover_places_with_website(maps_query, limit=MAPS_SITE_LEADS_PER_TERM)
            except Exception as exc:  # never let Maps kill the cycle
                log.warning('Google Maps site discovery failed for %r: %s', maps_query, exc)
                found = []
            for place in found:
                industry_of.setdefault(id(place), (maps_query, maps_industry))
                site_candidates.append(place)
        nlp_kept = nlp_prefilter(site_candidates)
        verdicts = ai_fit_batch(nlp_kept, goal=(
            f'We sell: {our_services_text(settings)}. Our ideal client: {settings.icp_notes[:400] or "businesses that run on customers, leads and bookings"}.'))
        fit_n = sum(1 for _, fit in verdicts if fit)
        summary['notes'].append(
            f'Maps funnel: {len(site_candidates)} listings → {len(nlp_kept)} after NLP → '
            f'{fit_n} FIT, {len(verdicts) - fit_n} NOT_FIT, {len(nlp_kept) - len(verdicts)} held (AI unanswered)')
        for place, fit in verdicts:
            domain = _norm_domain(place.get('website', ''))
            if not fit:
                if domain and domain not in (settings.rejected_domains or []):
                    settings.rejected_domains = list(settings.rejected_domains or []) + [domain]
                    settings.save(update_fields=['rejected_domains'])
                    known.add(domain)
                continue
            name_l = place['name'].lower()
            if domain in known or name_l in known:
                continue
            if place.get('phone') and Lead.objects.filter(contact_phone=place['phone']).exists():
                continue
            maps_query, maps_industry = industry_of.get(id(place), ('', 'business'))
            known.add(domain)
            known.add(name_l)
            state, country = region_from_query(maps_query, domain)
            lead = Lead.objects.create(
                company=place['name'][:200],
                industry=maps_industry,
                website=domain,
                contact_phone=place.get('phone', ''),
                description=', '.join(filter(None, [place.get('category'), place.get('address')]))[:600],
                source=f'Search · Google Maps · {maps_query}',
                state=state,
                country=country,
                score=50,  # provisional, Profile replaces it
                analysis={'gmaps_address': place.get('address', ''),
                          'gmaps_rating': place.get('rating'),
                          'gmaps_reviews': place.get('reviews')},
            )
            new_leads.append(lead)
            summary['notes'].append(f'Search (Google Maps, AI fit): {lead.company} ({domain})')
            if len(new_leads) >= MAX_LEADS_PER_CYCLE:
                break
        # one Maps search per distinct query term (polite cap: MAPS_QUERIES_PER_CYCLE)
        for maps_query, maps_industry in maps_terms:
            try:
                no_site_places = discover_no_website_places(maps_query, limit=MAPS_LEADS_PER_CYCLE)
            except Exception as exc:  # never let Maps kill the cycle
                log.warning('Google Maps discovery failed for %r: %s', maps_query, exc)
                no_site_places = []
            for place in no_site_places:
                name_l = place['name'].lower()
                if name_l in known:
                    continue
                if Lead.objects.filter(contact_phone=place['phone']).exists():
                    continue
                known.add(name_l)
                state, country = region_from_query(maps_query)
                desc = ', '.join(filter(None, [place.get('category'), place.get('address')]))[:600]
                lead = Lead.objects.create(
                    company=place['name'][:200],
                    industry=maps_industry,
                    website='',
                    contact_phone=place['phone'],
                    description=desc,
                    source=f'Search · Google Maps · {maps_query}',
                    state=state,
                    country=country,
                    score=95,  # no website at all — Profile re-audits and confirms
                    analysis={'phone_source': 'google-maps',
                              'gmaps_address': place.get('address', ''),
                              'gmaps_rating': place.get('rating'),
                              'gmaps_reviews': place.get('reviews')},
                )
                new_leads.append(lead)
                summary['notes'].append(
                    f'Search (Google Maps): {lead.company} — no website, phone {place["phone"]}')

    discovery_stats['maps_new'] = len(new_leads) - web_new
    _heartbeat()

    # --- PROFILE: scrape + audit up to N unprofiled leads ------------------
    potentials_created = 0
    rejected = 0
    # oldest first: a lead held by the AI gate is retried before newer
    # discoveries, so held leads are never starved by a stream of new ones
    to_profile = list(Lead.objects.filter(profiled=False)
                      .order_by('created_at')[:MAX_PROFILE_PER_CYCLE])
    budget_left_unprofiled = 0
    for idx, lead in enumerate(to_profile):
        if _out_of_time(deadline):
            # wall-clock budget spent: stop starting new site fetches — the
            # rest stay profiled=False and are picked up first next cycle
            budget_left_unprofiled = len(to_profile) - idx
            summary['notes'].append(
                f'Profile: cycle time budget reached — {budget_left_unprofiled} lead(s) '
                f'left unprofiled for the next cycle')
            break
        if idx and idx % HEARTBEAT_EVERY_LEADS == 0:
            _heartbeat()
        if lead != to_profile[0]:
            time.sleep(1)  # politeness pause between site fetches
        audit = analyze_website(lead.company, lead.website, prefer_country=lead.country)
        lead.has_website = audit['has_website']
        # only overwrite when the audit actually found something — a Maps lead
        # arrives with a phone from its listing and no website to scrape
        if audit.get('contact_email'):
            lead.contact_email = audit['contact_email']
        if audit.get('contact_phone'):
            lead.contact_phone = audit['contact_phone']
        lead.findings = audit['findings']
        # merge — audit keys win, but Maps/SERP metadata survives the audit
        lead.analysis = {**(lead.analysis or {}), **(audit['analysis'] or {})}
        lead.score = audit['score']
        # ICP gate (core.icp) — competitor agencies never enter the CRM, even
        # in keyless mode: heuristic fingerprints over name / industry /
        # description / SERP snippet.  Same strict treatment as the AI gate:
        # domain blacklisted so it is never re-discovered.
        if looks_like_competitor(lead, settings):
            domain = _norm_domain(lead.website)
            if domain and domain not in (settings.rejected_domains or []):
                settings.rejected_domains = list(settings.rejected_domains or []) + [domain]
                settings.save(update_fields=['rejected_domains'])
            summary['notes'].append(
                f'Profile rejected {lead.company} ({lead.website or "no website"}) — '
                f'competitor/peer of ours, not a buyer (ICP filter, domain blacklisted)')
            # a rejected lead leaves the CRM immediately — it must not stay in
            # this cycle's leads_created count either
            new_leads = [nl for nl in new_leads if nl.pk != lead.pk]
            lead.delete()
            rejected += 1
            continue
        # Gemini reads the site's own text → relevance gate + real description
        relevant, description = _ai_review(lead, audit, settings, our_services=our_services_text(settings))
        if relevant is None:
            # strict fake-data gate: the AI couldn't review this lead right now
            # (throttle / network) — leave it unprofiled (nothing persisted) so
            # the next cycle re-scrapes and re-vets it.  Unverified sites never
            # enter the CRM.
            summary['notes'].append(
                f'Profile held {lead.company} — AI review unavailable, retries next cycle')
            continue
        if not relevant:
            # only genuine, industry-relevant businesses stay in the CRM — and
            # the domain is remembered so later cycles can't re-admit it
            domain = _norm_domain(lead.website)
            if domain and domain not in (settings.rejected_domains or []):
                settings.rejected_domains = list(settings.rejected_domains or []) + [domain]
                settings.save(update_fields=['rejected_domains'])
            summary['notes'].append(
                f'Profile rejected {lead.company} ({lead.website}) — AI review: '
                f'not a relevant {lead.industry or "industry"} business (domain blacklisted)')
            new_leads = [nl for nl in new_leads if nl.pk != lead.pk]
            lead.delete()
            rejected += 1
            continue
        lead.description = description or lead.description
        # the site's own content names its city — that beats the query guess
        if audit.get('country'):
            lead.state = audit.get('state') or lead.state
            lead.country = audit['country']
        site_name = audit['analysis'].get('site_name')
        if site_name and _looks_like_company(site_name):
            lead.company = site_name[:200]
        # Paid phone enrichment (Scalelist → Apollo) for THIS lead — only now
        # that it passed both gates, so credits are never spent on leads that
        # are deleted or held.  Either source only fills an EMPTY phone; a
        # scraped number always wins.
        phone = _paid_phone_lookup(lead)
        if phone:
            lead.contact_phone = phone
        lead.profiled = True
        lead.analysis['profiled_at'] = timezone.now().isoformat()
        lead.save()
        profiled_now.append(lead.pk)
        # Phone rescue — a lead without a number is unusable for outreach.
        # Scalelist/Apollo need keys; Google Maps is free, so every freshly
        # profiled lead gets ONE immediate Maps lookup (matched by domain,
        # then name).  The later sweep retries whatever is still missing.
        if not lead.contact_phone and gmaps_available():
            try:
                if enrich_leads_via_gmaps([lead], delay=0):
                    summary['notes'].append(
                        f'Enrichment: {lead.company} phone via Google Maps '
                        f'({lead.contact_phone})')
            except Exception as exc:      # never let a lookup kill the audit
                log.warning('gmaps phone rescue failed for %s: %s', lead.company, exc)
        kind = 'website' if lead.has_website else 'NO website'
        summary['notes'].append(
            f'Profile audited {lead.company} ({kind}) → potential {lead.score}/100, '
            f'{len(lead.findings)} finding(s)')

        if lead.score >= POTENTIAL_THRESHOLD and not lead.potentials.exists():
            if agency_mode(settings):
                opportunity = 'White-label project partnership'
                stage = 'qualified' if lead.score >= 80 else 'discovery'
            elif not lead.has_website:
                opportunity, stage = 'New website — no working web presence', 'discovery'
            else:
                areas = {f['area'] for f in lead.findings}
                opportunity = ('Website & SEO overhaul' if {'SEO', 'Mobile'} & areas else
                               'Performance optimization retainer' if 'Performance' in areas else
                               'Website improvements package')
                stage = 'qualified' if lead.score >= 80 else 'discovery'
            value = max(4000, lead.score * 750 // 1000 * 1000)
            Potential.objects.create(
                company=lead.company,
                opportunity=opportunity,
                value=f'${value:,}',
                stage=stage,
                owner_agent='Profile agent',
                lead=lead,
            )
            potentials_created += 1
            summary['notes'].append(f'Profile flagged {lead.company} as POTENTIAL ({opportunity})')

    if rejected:
        summary['notes'].append(
            f'Profile: {rejected} discovery result(s) removed — AI review found them not '
            f'relevant businesses (kept the CRM strictly relevant)')

    # --- RE-PROFILE: refresh stale audits (a few per cycle) ----------------
    refreshed = 0
    if not _out_of_time(deadline):
        for lead in reprofile_candidates(REPROFILE_PER_CYCLE):
            if _out_of_time(deadline):
                break
            try:
                if _reprofile(lead):
                    refreshed += 1
            except Exception as exc:  # never let a refresh kill the cycle
                log.warning('re-profile failed for %s: %s', lead.company, exc)
    if refreshed:
        summary['notes'].append(
            f'Profile refreshed {refreshed} lead(s) audited over {REPROFILE_AFTER_DAYS} days ago')
    _heartbeat()

    # --- ENRICH: Scalelist + Apollo + Google Maps phone sweep (every cycle) -
    # Profiled leads whose phone field is still empty are retried:
    # 1) Scalelist person/company phone find (work email / company + domain)
    # 2) Apollo.io company database
    # 3) Apify Google Maps extractor — location-aware, strongest for India —
    #    matched to each lead by website domain, never by result position.
    # Paid lookups run at most once per lead per ENRICH_RETRY_HOURS (stamped in
    # analysis.enrich_tried_at, hit or miss) — leads inside the window are
    # skipped without using up the cycle's attempts.
    # Sequential, capped calls: rate-limit friendly, never blocks discovery.
    enriched = 0
    sweep = []
    phone_missing = (Lead.objects.filter(profiled=True)
                     .exclude(website='').filter(contact_phone=''))
    # not-due leads are excluded IN the query (never tried, or last stamp older
    # than the window) so a block of high-score leads inside their window can't
    # crowd lower-score due leads out of the pool
    due_cutoff = (timezone.now() - timezone.timedelta(hours=ENRICH_RETRY_HOURS)).isoformat()
    sweep_pool = (phone_missing
                  .filter(Q(analysis__enrich_tried_at__isnull=True)
                          | Q(analysis__enrich_tried_at__lt=due_cutoff))
                  .order_by('-score', 'id'))
    for lead in sweep_pool.iterator():
        if len(sweep) >= APOLLO_SWEEP_PER_CYCLE:
            break
        if not _enrich_due(lead):
            continue
        sweep.append(lead)
        phone = _paid_phone_lookup(lead)
        if phone:
            lead.contact_phone = phone
            lead.save()
            enriched += 1
            summary['notes'].append(
                f'Enrichment: {lead.company} phone via {lead.analysis["phone_source"]} ({phone})')
        else:
            lead.save(update_fields=['analysis'])   # keep the stamp (and any employee count) on a miss
    if sweep:
        summary['notes'].append(
            f'Enrichment sweep: {enriched}/{len(sweep)} phone(s) recovered')

    # Free Google Maps round (core.gmaps keyless scraper) — whatever is still
    # missing gets one Maps lookup per lead, matched by domain then by name.
    # Runs BEFORE Apify so the paid actor is strictly the last resort.
    # The free and Apify rounds run on their OWN list — not filtered by the
    # paid-lookup window, so a lead the paid sweep skipped (or couldn't try for
    # lack of a key) still gets its free Maps lookup.
    maps_pool = list(phone_missing.order_by('-score', 'id')[:APOLLO_SWEEP_PER_CYCLE])
    if gmaps_available():
        still_missing = [l for l in maps_pool if not l.contact_phone]
        if still_missing:
            gmaps_hits = enrich_leads_via_gmaps(still_missing[:APOLLO_SWEEP_PER_CYCLE])
            for lead in gmaps_hits:
                enriched += 1
                summary['notes'].append(
                    f'Enrichment: {lead.company} phone via Google Maps ({lead.contact_phone})')

    # Apify Google Maps round — one batched actor run for whatever is still missing
    if apify_maps_available():
        maps_still_missing = [l for l in maps_pool if not l.contact_phone]
        if maps_still_missing:
            mapped = enrich_leads_via_apify(maps_still_missing[:APOLLO_SWEEP_PER_CYCLE])
            for lead in mapped:
                enriched += 1
                summary['notes'].append(
                    f'Enrichment: {lead.company} phone via Google Maps ({lead.contact_phone})')

    # --- COPYWRIGHT: draft cold emails for profiled leads ------------------
    # Strict contact-first policy: drafts are only written for leads we can
    # actually reach — a real scraped contact email is required, highest
    # potential first.  Leads without an email stay in the CRM for manual /
    # phone follow-up instead of getting a draft addressed to nobody.
    drafts_created = 0
    # High-level prospects have polished sites with few/no audit findings —
    # drafting keys off REACHABILITY (a real contact email), not site flaws.
    reachable = (Lead.objects.filter(profiled=True).exclude(contact_email='')
                 .filter(drafts__isnull=True))  # never re-draft: rejected stays rejected
    # sites that block bots need a human look — filtered in the query so they
    # never eat a draft slot.  Exclude via a pk subquery: a bare
    # exclude(analysis__blocked=True) also drops leads whose analysis has no
    # 'blocked' key (NULL = true), on SQLite and Postgres alike.
    # '-score' then 'id' keeps the pick deterministic.
    blocked = Lead.objects.filter(analysis__blocked=True).values('pk')
    # an unsubscribed address never gets a new draft (Suppression is lowercased)
    suppressed = Suppression.objects.values('email')
    candidates = (reachable.exclude(pk__in=blocked)
                  .annotate(_email_lc=Lower(Trim('contact_email')))
                  .exclude(_email_lc__in=suppressed)
                  .order_by('-score', 'id')[:MAX_DRAFTS_PER_CYCLE * 3])
    # per-cycle notes: count only leads profiled in THIS cycle (all-time DB counts
    # would inflate every cycle summary and the daily report)
    blocked_skipped = reachable.filter(pk__in=blocked).filter(pk__in=profiled_now).count()
    no_email = Lead.objects.filter(pk__in=profiled_now, contact_email='').count()
    if blocked_skipped:
        summary['notes'].append(
            f'Copywright skipped {blocked_skipped} lead(s) — site blocks bots, needs human review')
    for lead in candidates:
        if drafts_created >= MAX_DRAFTS_PER_CYCLE:
            break
        subject, body, used_llm = _draft_email(lead)
        EmailDraft.objects.create(
            lead=lead,
            company=lead.company,
            to_email=lead.contact_email,
            subject=subject,
            body=body,
            findings=lead.findings[:3],
            status=EmailDraft.Statuses.DRAFT,
        )
        drafts_created += 1
        via = 'LLM' if used_llm else 'template'
        summary['notes'].append(f'Copywright drafted cold email for {lead.company} ({via})')
    if no_email:
        summary['notes'].append(
            f'Copywright: {no_email} lead(s) without a contact email held for manual outreach — '
            f'no draft is written to a missing address')

    # --- RESPONDER: report the outreach queue + prospect replies ----------
    # (replies themselves are read by core.inbox on its own worker thread)
    from .inbox import needs_attention_qs
    replies_waiting = needs_attention_qs().count()
    queue = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count()
    awaiting_contact = Lead.objects.filter(
        profiled=True, has_website=True, contact_email='').count()
    summary['notes'].append(
        f'Responder: {queue} draft(s) awaiting approval, '
        f'{awaiting_contact} lead(s) still missing a contact email, '
        f'{replies_waiting} prospect repl{"y" if replies_waiting == 1 else "ies"} waiting on you')

    run = PipelineRun.objects.create(
        triggered_by=triggered_by,
        leads_created=len(new_leads),
        potentials_created=potentials_created,
        replies_created=drafts_created,  # reuse the counter for drafts in the UI
        summary={
            'notes': summary['notes'],
            'query': summary.get('query', ''),
            'drafts_created': drafts_created,
            'discovery': discovery_stats,
            'agents': [
                {'agent': 'search', 'action': f'{len(new_leads)} new lead(s) via DuckDuckGo'
                    + (' + Google Maps' if gmaps_available() and not agency_mode(settings) else '')
                    + (f' (agency-partner targeting)' if agency_mode(settings)
                       else ' (ICP buyer targeting)')},
                {'agent': 'profile', 'action': f'{len(to_profile)} site(s) audited'},
                {'agent': 'copywright', 'action': f'{drafts_created} draft(s) created'},
                {'agent': 'responder', 'action': f'{queue} draft(s) awaiting approval, '
                    f'{replies_waiting} repl{"y" if replies_waiting == 1 else "ies"} waiting'},
            ],
        },
    )
    # auto_now_add stamps creation (= the END of the cycle); record the real start
    PipelineRun.objects.filter(pk=run.pk).update(started_at=cycle_started)
    run.started_at = cycle_started
    return run


FREQUENCY_MINUTES = {'15m': 15, '1h': 60, '6h': 360, 'daily': 1440}


def pipeline_status():
    """Current loop state for the dashboard header."""
    settings = AppSettings.load()
    last = PipelineRun.objects.first()
    next_run_minutes = FREQUENCY_MINUTES.get(settings.run_frequency, 60)

    started_at = last.started_at if last else None
    elapsed = (timezone.now() - started_at).total_seconds() / 60 if started_at else None
    due = settings.runs_enabled and (elapsed is None or elapsed >= next_run_minutes)
    since = running_since()
    worker = status_of('worker', max_age_seconds=120)

    return {
        'running': settings.runs_enabled,  # legacy name — same as autopilot
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
        # no countdown while autopilot is off — nothing is scheduled
        'nextRunInMinutes': None if due or not settings.runs_enabled
                            else max(0, int(next_run_minutes - (elapsed or 0))),
    }
