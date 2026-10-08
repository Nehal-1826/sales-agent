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
import re
import time

from django.utils import timezone

from .ai import llm_available, llm_complete
from .enrichment import apollo_enrich_domain
from .models import AgentConfig, AppSettings, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential
from .scalelist import scalelist_phone_find
from .scraper import (
    analyze_website,
    region_from_query,
    search_companies,
    search_queries_for_cycle,
)
from .scraper import search_query_for_cycle  # noqa: F401 — re-exported for scripts/tests

log = logging.getLogger(__name__)

MAX_LEADS_PER_CYCLE = 6      # new companies discovered per cycle (across all region queries)
MAX_PROFILE_PER_CYCLE = 6    # sites scraped+audited per cycle
MAX_DRAFTS_PER_CYCLE = 3     # cold emails drafted per cycle
APOLLO_SWEEP_PER_CYCLE = 5   # phone-enrichment retries per cycle (quota-friendly)

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


def _ai_review(lead, audit):
    """Gemini reads the lead's own site text and answers two questions in one
    call: is this an actual, relevant business — and what does it do?

    Returns (relevant, description).  relevant is:
      True   → genuine, industry-relevant business — keep it
      False  → blog/directory/landing-page junk — the caller deletes the lead
      None   → the AI was configured but could not answer right now (throttle,
               network, bad key) — the caller HOLDS the lead unprofiled so the
               next cycle re-vets it.  Strict mode: an unreviewed site never
               enters the CRM, because unvetted discoveries are where fake
               leads come from.  Without an AI key the fallback is (True, '')
               — keep everything, describe nothing (keyless demo mode)."""
    excerpt = (audit.get('analysis') or {}).get('text_excerpt', '')
    if not excerpt or not llm_available():
        return True, ''
    prompt = (
        f'You are vetting a sales-prospect lead discovered while searching for a '
        f'"{lead.industry or "business"}" (website: {lead.website}).\n\n'
        f'--- SITE TEXT ---\n{excerpt}\n--- END SITE TEXT ---\n\n'
        f'Answer in EXACTLY this format:\n'
        f'RELEVANT: yes|no\n'
        f'DESCRIPTION: <2-3 plain sentences: what does this company do, who are its '
        f'customers, what is its main offer>\n\n'
        f'Rules for RELEVANT: "no" only when the site is clearly NOT a real operating '
        f'business (blog post, news article, directory/listing, personal portfolio, '
        f'parked page, product of a huge corporation) OR is completely unrelated to '
        f'{lead.industry or "the industry we searched"}. A real small/mid company in a '
        f'closely related field is "yes". Use only what the text shows. No markdown.'
    )
    try:
        text = llm_complete(
            prompt,
            system='You vet sales leads accurately and conservatively from website text.',
            temperature=0)  # deterministic verdicts — no creative randomness
        if not text:
            return None, ''  # strict: hold for re-vetting instead of passing unvetted
        relevant = not re.search(r'RELEVANT:\s*no', text, re.I)
        m = re.search(r'DESCRIPTION:\s*(.+)', text, re.S)
        description = (m.group(1).strip().split('---')[0].strip() if m else '')
        description = ' '.join(description.split())[:600]
        return relevant, description
    except Exception as exc:
        log.warning('AI review failed for %s: %s', lead.company, exc)
        return None, ''


def _default_template():
    """The user's email template: the flagged default, else the newest."""
    return EmailTemplate.objects.filter(is_default=True).first() or EmailTemplate.objects.first()


TEMPLATE_VARS = ('company', 'industry', 'website', 'description',
                 'findings', 'sender_name', 'sender_website', 'services')


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
        'services': ', '.join(settings.services or []) or 'web design, SEO and growth',
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
    services = ', '.join(settings.services or []) or 'web design, SEO and growth'

    top = lead.findings[:3]
    template = _default_template()

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
        prompt = (
            f'Write a short cold outreach email (max 150 words).\n\n'
            f'PROSPECT: {lead.company} ({lead.industry or "unknown industry"}), website: '
            f'{lead.website or "NONE FOUND"}\n'
            f'{what_they_do}'
            f'AUDIT FINDINGS: {json.dumps([{k: f[k] for k in ("area", "issue", "recommendation")} for f in top], indent=1)}\n'
            f'WE (sender): {our_name} — offering {services}. Website: {our_site or "n/a"}\n\n'
            f'{template_block}'
            f'Rules: reference what they do plus 1-2 concrete findings; one clear ask '
            f'(short call); no pricing; no fake urgency.\n'
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
            subject = _fill_template(template.subject or f'Quick idea for {{company}}',
                                     lead, settings, top)
            body = _fill_template(template.body, lead, settings, top)
        elif lead.has_website:
            # built-in fallback — still personalized from the real audit findings
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
    return subject, body, used_llm


def run_pipeline(triggered_by='manual'):
    """Run one orchestrator cycle: Search → Profile → Copywright → Responder."""

    summary = {'agents': [], 'notes': []}
    cycle = PipelineRun.objects.count()

    # --- SEARCH (SCRAPE): real DuckDuckGo discovery, skip known companies --
    # Every cycle searches REGIONS_PER_CYCLE different countries, so the CRM
    # spreads across the world instead of one region at a time.
    queries = search_queries_for_cycle(cycle)
    results, query_labels = [], []
    for i, (query, industry) in enumerate(queries):
        if i:
            time.sleep(8)  # DDG rate-limits back-to-back queries — pace the sweep
        found = search_companies(query, n=6)
        results.extend({'industry': industry, 'query_label': query, **r} for r in found)
        query_labels.append(query)
        summary['notes'].append(f'Search: “{query}” → {len(found)} candidates')
    summary['query'] = ' | '.join(query_labels)

    known = {_norm_domain(w) for w in Lead.objects.exclude(website='').values_list('website', flat=True)}
    known |= {c.lower() for c in Lead.objects.values_list('company', flat=True)}
    # strict no-fake-data memory: once the AI has rejected a domain, it never
    # gets discovered again — verdicts can flip between runs, memory can't
    settings = AppSettings.load()
    known |= {d.lower() for d in (settings.rejected_domains or [])}
    new_leads = []
    seen_domains = set()
    per_region_cap = max(2, MAX_LEADS_PER_CYCLE // len(queries))  # spread across regions
    taken_per_query = {}
    for r in results:
        if len(new_leads) >= MAX_LEADS_PER_CYCLE:
            break
        domain = _norm_domain(r['website'])
        if not domain or domain in seen_domains or domain in known or r['name'].lower() in known:
            continue
        seen_domains.add(domain)
        query_label = r['query_label']
        if taken_per_query.get(query_label, 0) >= per_region_cap:
            continue  # don't let one region swallow the whole cycle
        taken_per_query[query_label] = taken_per_query.get(query_label, 0) + 1
        state, country = region_from_query(query_label, r['website'])
        lead = Lead.objects.create(
            company=r['name'],
            industry=r['industry'],
            website=r['website'],
            source=f'Search · DuckDuckGo · {query_label}',
            state=state,
            country=country,
            score=random.randint(45, 60),  # provisional, Profile replaces it
        )
        new_leads.append(lead)
        summary['notes'].append(f'Search discovered {lead.company} ({lead.website})')

    # --- PROFILE: scrape + audit up to N unprofiled leads ------------------
    potentials_created = 0
    rejected = 0
    to_profile = list(Lead.objects.filter(profiled=False)[:MAX_PROFILE_PER_CYCLE])
    for lead in to_profile:
        if lead != to_profile[0]:
            time.sleep(1)  # politeness pause between site fetches
        audit = analyze_website(lead.company, lead.website, prefer_country=lead.country)
        lead.has_website = audit['has_website']
        lead.contact_email = audit['contact_email']
        lead.contact_phone = audit.get('contact_phone', '')
        lead.findings = audit['findings']
        lead.analysis = audit['analysis']
        lead.score = audit['score']
        # Phone enrichment for THIS lead (matched by its own DB id — the loop
        # variable is the lead row itself, never a positional lookup):
        # 1) Scalelist person/company phone find — uses the scraped work email,
        #    else the company name + domain we just audited
        # 2) Apollo.io company database — fallback when Scalelist comes up empty
        # Either source only fills an EMPTY phone; a scraped number always wins.
        if not lead.contact_phone:
            scalelist_phone = scalelist_phone_find(
                email=lead.contact_email,
                company=lead.company,
                domain=lead.website,
            )
            if scalelist_phone:
                lead.contact_phone = scalelist_phone
                lead.analysis['phone_source'] = 'scalelist'
        if not lead.contact_phone:
            apollo = apollo_enrich_domain(lead.website)
            if apollo.get('phone'):
                lead.contact_phone = apollo['phone']
                lead.analysis['phone_source'] = 'apollo.io'
            if apollo.get('employees'):
                lead.analysis['employees'] = apollo['employees']
        # Gemini reads the site's own text → relevance gate + real description
        relevant, description = _ai_review(lead, audit)
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

    if rejected:
        summary['notes'].append(
            f'Profile: {rejected} discovery result(s) removed — AI review found them not '
            f'relevant businesses (kept the CRM strictly relevant)')

    # --- ENRICH: Scalelist + Apollo phone sweep (every cycle) ---------------
    # Profiled leads whose phone field is still empty are retried every cycle
    # against Scalelist (work email / company + domain) and then Apollo's
    # company database — until a number shows up or candidates run out.
    # Sequential, capped calls: rate-limit friendly, never blocks discovery.
    enriched = 0
    sweep = (Lead.objects.filter(profiled=True)
             .exclude(website='').filter(contact_phone='')
             .order_by('-score')[:APOLLO_SWEEP_PER_CYCLE])
    for lead in sweep:
        phone = scalelist_phone_find(
            email=lead.contact_email, company=lead.company, domain=lead.website)
        source = 'scalelist' if phone else ''
        if not phone:
            apollo = apollo_enrich_domain(lead.website)
            if apollo.get('phone'):
                phone = apollo['phone']
                source = 'apollo.io'
                lead.analysis = {**(lead.analysis or {}), 'employees': apollo['employees']} \
                    if apollo.get('employees') else (lead.analysis or {})
        if phone:
            lead.contact_phone = phone
            lead.analysis = {**(lead.analysis or {}), 'phone_source': source}
            lead.save()
            enriched += 1
            summary['notes'].append(
                f'Enrichment: {lead.company} phone via {source} ({phone})')
    if sweep:
        summary['notes'].append(
            f'Enrichment sweep: {enriched}/{len(sweep)} phone(s) recovered')

    # --- COPYWRIGHT: draft cold emails for profiled leads ------------------
    # Strict contact-first policy: drafts are only written for leads we can
    # actually reach — a real scraped contact email is required, highest
    # potential first.  Leads without an email stay in the CRM for manual /
    # phone follow-up instead of getting a draft addressed to nobody.
    drafts_created = 0
    candidates = [l for l in Lead.objects.filter(profiled=True) if l.findings]
    candidates.sort(key=lambda l: (not bool(l.contact_email), -l.score))
    no_email = 0
    for lead in candidates:
        if drafts_created >= MAX_DRAFTS_PER_CYCLE:
            break
        if not lead.contact_email:
            no_email += 1
            continue
        if (lead.analysis or {}).get('blocked'):
            summary['notes'].append(
                f'Copywright skipped {lead.company} — site blocks bots, needs human review')
            continue
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
    if no_email:
        summary['notes'].append(
            f'Copywright: {no_email} lead(s) without a contact email held for manual outreach — '
            f'no draft is written to a missing address')

    # --- RESPONDER: report the outreach queue ------------------------------
    queue = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count()
    awaiting_contact = Lead.objects.filter(
        profiled=True, has_website=True, contact_email='').count()
    summary['notes'].append(
        f'Responder: {queue} draft(s) awaiting approval, '
        f'{awaiting_contact} lead(s) still missing a contact email')

    # --- AI AUTOPILOT: when the user has accepted control, send on its own --
    from .autopilot import autopilot_tick  # late import — avoids a cycle
    auto_sent = autopilot_tick()
    if auto_sent:
        summary['notes'].append(f'Autopilot: approved and sent {auto_sent} email(s) automatically')

    run = PipelineRun.objects.create(
        triggered_by=triggered_by,
        leads_created=len(new_leads),
        potentials_created=potentials_created,
        replies_created=drafts_created,  # reuse the counter for drafts in the UI
        summary={
            'notes': summary['notes'],
            'query': summary.get('query', ''),
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
