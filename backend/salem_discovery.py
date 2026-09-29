"""One-off: discover + profile leads in Salem, Tamil Nadu (India).

Uses the same Search (DuckDuckGo) → Profile (site audit) logic as the
orchestrator pipeline, but with a fixed Salem query set instead of the
worldwide rotation. Safe to re-run: dedupes against existing leads.
"""
import os
import random

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'agentic.settings')
django.setup()

from core.models import Lead, Potential          # noqa: E402
from core.scraper import analyze_website, region_from_query, search_companies  # noqa: E402
from django.conf import settings                  # noqa: E402

POTENTIAL_THRESHOLD = 65  # mirrors pipeline.POTENTIAL_THRESHOLD

SALEM_QUERIES = [
    ('web design agency', 'digital marketing agency Salem Tamil Nadu'),
    ('dental clinic', 'dental clinic Salem Tamil Nadu'),
    ('boutique hotel', 'hotels Salem Tamil Nadu'),
    ('real estate agency', 'real estate builders Salem Tamil Nadu'),
    ('IT consulting firm', 'software companies Salem Tamil Nadu'),
    ('construction company', 'construction company Salem Tamil Nadu'),
]


def our_name():
    s = settings.DATABASES  # keep imports tidy; name comes from AppSettings
    from core.models import AppSettings
    app = AppSettings.objects.first()
    return (app.company_name if app else 'Northstar Growth Partners')


def main():
    known = {w.lower() for w in Lead.objects.exclude(website='').values_list('website', flat=True)}
    known |= {c.lower() for c in Lead.objects.values_list('company', flat=True)}

    created = []
    for industry, query in SALEM_QUERIES:
        results = search_companies(query, n=6)
        print(f'[search] "{query}" -> {len(results)} candidates', flush=True)
        for r in results:
            domain = r['website'].lower()
            if domain in known or r['name'].lower() in known:
                continue
            known |= {domain, r['name'].lower()}
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
            created.append(lead)
            print(f'  + {lead.company} ({lead.website})', flush=True)

    print(f'\n[search] {len(created)} new Salem leads created', flush=True)

    # --- PROFILE: audit each new lead's site --------------------------------
    potentials = 0
    for lead in created:
        try:
            audit = analyze_website(lead.company, lead.website)
        except Exception as exc:  # keep going if one site fails
            print(f'  ! profile failed for {lead.company}: {exc}', flush=True)
            continue
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
        print(f'[profile] {lead.company} ({kind}) -> {lead.score}/100, '
              f'{len(lead.findings)} finding(s)', flush=True)

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
                company=lead.company, opportunity=opportunity,
                value=f'${value:,}', stage=stage,
                owner_agent='Profile agent', lead=lead,
            )
            potentials += 1

    print(f'\n[done] {len(created)} Salem leads, {potentials} potentials created', flush=True)


if __name__ == '__main__':
    main()
