"""
The autonomous pipeline — orchestrator dispatching the agents from the notes:

    USER → ORCHESTRATOR → SEARCH (SCRAPE) → PROFILE → COPYWRIGHT
                       → RESPONDER (CHATBOT) → LOOP back to SEARCH

Real implementation:
    SEARCH      live DuckDuckGo discovery, worldwide industry × region rotation
    PROFILE     scrapes each lead's site, categorizes website / no-website,
                extracts contact email, produces flaw findings + potential score
    COPYWRIGHT  drafts a personalized cold email per lead (LLM when an AI key
                is configured, strong template otherwise) → EmailDraft(draft)
    RESPONDER   reports the outreach queue; humans approve → mailer sends
"""

import json
import logging
import random

from django.utils import timezone

from .ai import llm_available, llm_complete
from .models import AgentConfig, AppSettings, EmailDraft, Lead, PipelineRun, Potential
from .scraper import analyze_website, region_from_query, search_companies, search_query_for_cycle

log = logging.getLogger(__name__)

MAX_LEADS_PER_CYCLE = 3      # new companies discovered per cycle
MAX_PROFILE_PER_CYCLE = 3    # sites scraped+audited per cycle
MAX_DRAFTS_PER_CYCLE = 2     # cold emails drafted per cycle

# Score at which Profile flags a POTENTIAL opportunity.
POTENTIAL_THRESHOLD = 65


def _copywright_config():
    cfg = AgentConfig.objects.filter(agent='copywright').first()
    return cfg


def _draft_email(lead):
    """Copywright agent: personalized cold email for one lead.

    Returns (subject, body, used_llm)."""
    settings = AppSettings.load()
    cfg = _copywright_config()
    our_name = settings.company_name or 'the team'
    our_site = settings.company_website
    services = ', '.join(settings.services or []) or 'web design, SEO and growth'

    top = lead.findings[:3]
    if lead.has_website:
        focus = '; '.join(f['issue'] for f in top) or 'a few quick wins on their site'
    else:
        focus = 'no working website at all'

    subject = ''
    body = ''
    if llm_available():
        system = (cfg.system_prompt if cfg and cfg.system_prompt else
                  'You are an expert B2B cold-email copywriter. Be concise, specific, human. '
                  'No hype, no empty flattery, no attachments.')
        negative = cfg.negative_prompt if cfg else ''
        prompt = (
            f'Write a short cold outreach email (max 150 words).\n\n'
            f'PROSPECT: {lead.company} ({lead.industry or "unknown industry"}), website: '
            f'{lead.website or "NONE FOUND"}\n'
            f'AUDIT FINDINGS: {json.dumps([{k: f[k] for k in ("area", "issue", "recommendation")} for f in top], indent=1)}\n'
            f'WE (sender): {our_name} — offering {services}. Website: {our_site or "n/a"}\n\n'
            f'Rules: reference 1-2 concrete findings; one clear ask (short call); '
            f'no pricing; no fake urgency.\n'
            f'{"Avoid: " + negative if negative else ""}\n\n'
            f'Respond in EXACTLY this format:\n'
            f'SUBJECT: <subject line>\n\n<email body>'
        )
        text = llm_complete(prompt, system=system, model=(cfg.model if cfg else ''))
        if text:
            m = text.split('SUBJECT:', 1)
            if len(m) == 2:
                rest = m[1].strip().split('\n', 1)
                subject = rest[0].strip()[:290]
                body = (rest[1] if len(rest) > 1 else '').strip()
            else:
                subject, body = '', text.strip()
            body = body.replace('```', '').strip()

    if not subject or not body:
        # Template fallback — still personalized from the real audit findings
        if lead.has_website:
            subject = f'Quick idea for {lead.company}'
            bullets = '\n'.join(f'• {f["issue"]} → {f["recommendation"]}' for f in top) or \
                '• a few on-page improvements worth making'
            body = (
                f'Hi {lead.company} team,\n\n'
                f'I was researching {lead.industry or "companies in your space"} and looked at '
                f'{lead.website} — a couple of things stood out:\n\n'
                f'{bullets}\n\n'
                f'We help teams fix exactly this ({services}). '
                f'Worth a 15-minute call next week to walk through the top items?\n\n'
                f'Best,\n{our_name}\n{our_site}'
            ).strip()
        else:
            subject = f'Getting {lead.company} online'
            body = (
                f'Hi {lead.company} team,\n\n'
                f'I couldn\'t find a working website for {lead.company} — which usually means '
                f'customers searching for you end up with competitors instead.\n\n'
                f'We build fast, search-ready sites for {lead.industry or "businesses like yours"} '
                f'({services}). Would a 15-minute call next week be useful?\n\n'
                f'Best,\n{our_name}\n{our_site}'
            ).strip()
    return subject, body, bool(subject and llm_available())


def run_pipeline(triggered_by='manual'):
    """Run one orchestrator cycle: Search → Profile → Copywright → Responder."""

    summary = {'agents': [], 'notes': []}
    cycle = PipelineRun.objects.count()

    # --- SEARCH (SCRAPE): real DuckDuckGo discovery, skip known companies --
    query, industry = search_query_for_cycle(cycle)
    summary['query'] = query
    results = search_companies(query, n=10)
    summary['notes'].append(f'Search: “{query}” → {len(results)} candidates')

    known = {w.lower() for w in Lead.objects.exclude(website='').values_list('website', flat=True)}
    known |= {c.lower() for c in Lead.objects.values_list('company', flat=True)}
    new_leads = []
    seen_domains = set()
    for r in results:
        if len(new_leads) >= MAX_LEADS_PER_CYCLE:
            break
        domain = r['website'].lower()
        if domain in seen_domains or domain in known or r['name'].lower() in known:
            continue
        seen_domains.add(domain)
        state, country = region_from_query(query, r['website'])
        lead = Lead.objects.create(
            company=r['name'],
            industry=industry,
            website=r['website'],
            source=f'Search · DuckDuckGo · {query}',
            state=state,
            country=country,
            score=random.randint(45, 60),  # provisional, Profile replaces it
        )
        new_leads.append(lead)
        summary['notes'].append(f'Search discovered {lead.company} ({lead.website})')

    # --- PROFILE: scrape + audit up to N unprofiled leads ------------------
    potentials_created = 0
    to_profile = list(Lead.objects.filter(profiled=False)[:MAX_PROFILE_PER_CYCLE])
    for lead in to_profile:
        audit = analyze_website(lead.company, lead.website)
        lead.has_website = audit['has_website']
        lead.contact_email = audit['contact_email']
        lead.findings = audit['findings']
        lead.analysis = audit['analysis']
        lead.score = audit['score']
        site_name = audit['analysis'].get('site_name')
        if site_name:
            lead.company = site_name[:200]
        lead.profiled = True
        lead.save()
        kind = 'website' if lead.has_website else 'NO website'
        summary['notes'].append(
            f'Profile audited {lead.company} ({kind}) → potential {lead.score}/100, '
            f'{len(lead.findings)} finding(s)')

        if lead.score >= POTENTIAL_THRESHOLD and not lead.potentials.exists():
            if not lead.has_website:
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

    # --- COPYWRIGHT: draft cold emails for profiled leads ------------------
    drafts_created = 0
    profiled = [l for l in Lead.objects.filter(profiled=True) if l.findings]
    for lead in profiled:
        if drafts_created >= MAX_DRAFTS_PER_CYCLE:
            break
        if lead.drafts.exclude(status=EmailDraft.Statuses.REJECTED).exists():
            continue
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

    # --- RESPONDER: report the outreach queue ------------------------------
    queue = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count()
    awaiting_contact = Lead.objects.filter(
        profiled=True, has_website=True, contact_email='').count()
    summary['notes'].append(
        f'Responder: {queue} draft(s) awaiting approval, '
        f'{awaiting_contact} lead(s) still missing a contact email')

    run = PipelineRun.objects.create(
        triggered_by=triggered_by,
        leads_created=len(new_leads),
        potentials_created=potentials_created,
        replies_created=drafts_created,  # reuse the counter for drafts in the UI
        summary={
            'notes': summary['notes'],
            'query': query,
            'drafts_created': drafts_created,
            'agents': [
                {'agent': 'search', 'action': f'{len(new_leads)} new lead(s) via DuckDuckGo'},
                {'agent': 'profile', 'action': f'{len(to_profile)} site(s) audited'},
                {'agent': 'copywright', 'action': f'{drafts_created} draft(s) created'},
                {'agent': 'responder', 'action': f'{queue} draft(s) awaiting approval'},
            ],
        },
    )
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

    return {
        'running': settings.runs_enabled,
        'frequency': settings.run_frequency,
        'lastRun': {
            'id': last.id,
            'at': started_at.isoformat() if started_at else None,
            'summary': last.summary,
        } if last else None,
        'nextRunInMinutes': None if due else max(0, int(next_run_minutes - (elapsed or 0))),
    }
