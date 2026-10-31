"""
Seed the database with the demo dataset used across the frontend:

    python manage.py seed_demo

Creates:
  • demo operator user (owner) + api token
  • the four agent configs (Search / Profile / Copywright / Responder)
  • app settings (company profile · ai key · frequent runs)
  • CRM content: leads, potentials, replies
  • one finished pipeline run so the dashboard has history
"""

from django.core.management.base import BaseCommand
from rest_framework.authtoken.models import Token

from core.models import (
    AppSettings, ChatMessage, EmailDraft, Lead, PipelineRun, Potential, Reply, User, Workspace,
)
from core.tenancy import workspace_context
from core.workspaces import provision_workspace

DEMO_SLUG = 'demo'

DEMO_USERNAME = 'operator'
DEMO_PASSWORD = 'operator-demo-2026'

LEADS = [
    ('Acme Robotics', 'Industrial automation', 'acmerobotics.io', 91, 'Search · scraped 42 pages', True),
    ('BlueRiver Finance', 'Fintech lending', 'blueriver.finance', 88, 'Search · industry index', True),
    ('Northwind Logistics', 'Supply chain & freight', 'northwindlogistics.com', 84, 'Search · scraped 34 pages', True),
    ('Orbit Health', 'HealthTech SaaS', 'orbithealth.ai', 82, 'Search · partner directory', True),
    ('Helios Energy', 'Renewables / solar', 'heliosenergy.com', 76, 'Search · conference list', True),
    ('Vantage Retail Group', 'E-commerce operations', 'vantage-retail.com', 71, 'Search · scraped 21 pages', True),
    ('Kestrel Manufacturing', 'Precision parts', 'kestrel-mfg.com', 64, 'Search / Scrape', False),
]

POTENTIALS = [
    ('Acme Robotics', 'Pilot — automated outreach for 3 sales regions', '$48,000', 'proposal', 'Copywright agent'),
    ('BlueRiver Finance', 'Quarterly lead-generation campaign', '$120,000', 'qualified', 'Profile agent'),
    ('Northwind Logistics', 'Profile-enrichment retainer', '$24,000', 'negotiation', 'Responder agent'),
    ('Helios Energy', 'Content engine subscription', '$60,000', 'qualified', 'Copywright agent'),
    ('Orbit Health', 'Responder integration pilot', '$36,000', 'discovery', 'Profile agent'),
]

REPLIES = [
    ('Acme Robotics', 'J. Meyer · Head of Growth', 'email', 'replied', 'Interested in a pilot — asked for pricing.'),
    ('BlueRiver Finance', 'S. Okafor · Ops Director', 'linkedin', 'meeting', 'Intro call booked for Thursday 14:00.'),
    ('Orbit Health', 'D. Lin · CTO', 'email', 'awaiting', 'Asked for security & compliance docs.'),
    ('Vantage Retail Group', 'P. Singh · CMO', 'email', 'replied', 'Requested a case study before deciding.'),
    ('Kestrel Manufacturing', 'R. Alvarez · Procurement', 'webchat', 'awaiting', 'Budget cycle question — draft pending.'),
]


class Command(BaseCommand):
    help = ('Seed the demo user + agent configs (idempotent).  The sample CRM '
            'data (FAKE companies/contacts) is only inserted with --demo-crm — '
            'production/real-use databases must never contain it.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--demo-crm', action='store_true',
            help='Also insert the sample CRM dataset (fake companies — dev UI preview only)')

    def handle(self, *args, **options):
        # The demo is its own tenant, so it can never mix into a real company's CRM.
        ws, _ = Workspace.all_tenants.get_or_create(
            slug=DEMO_SLUG, defaults={'name': 'Demo'})
        provision_workspace(ws)
        with workspace_context(ws):
            self._seed(options)

    def _seed(self, options):
        # --- demo user (owner) -------------------------------------------
        user, created = User.objects.get_or_create(
            username=DEMO_USERNAME,
            defaults={'email': 'operator@agentic.local', 'role': User.Roles.OWNER, 'first_name': 'Operator'},
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        token, _ = Token.objects.get_or_create(user=user)

        # --- settings -----------------------------------------------------
        # provision_workspace made the neutral row; fill the demo profile only once
        settings = AppSettings.load()
        if not settings.company_name:
            for field, value in {
                'company_name': 'Shailog Technologies',
                'company_website': 'https://shailog.com',
                'company_description': 'Custom software engineering team building SaaS platforms, web '
                                       'applications and React Native mobile apps for founders — MVPs '
                                       'shipped in 8–14 weeks with fixed quotes, full IP handover and '
                                       'post-launch support.',
                'services': ['Custom SaaS & web app development', 'React Native mobile apps',
                             'Web design', 'Rapid deployment & support'],
                'ai_provider': 'Google AI',
                'runs_enabled': True,
                'run_frequency': '1h',
            }.items():
                setattr(settings, field, value)
            settings.save(update_fields=[
                'company_name', 'company_website', 'company_description', 'services',
                'ai_provider', 'runs_enabled', 'run_frequency'])

        # --- CRM ----------------------------------------------------------
        if options.get('demo_crm') and not Lead.objects.exists():
            for company, industry, website, score, source, profiled in LEADS:
                Lead.objects.create(
                    company=company, industry=industry, website=website,
                    score=score, source=source, profiled=profiled,
                )
            lead_by_name = {l.company: l for l in Lead.objects.all()}
            for company, opportunity, value, stage, owner in POTENTIALS:
                Potential.objects.create(
                    company=company, opportunity=opportunity, value=value,
                    stage=stage, owner_agent=owner, lead=lead_by_name.get(company),
                )
            for company, contact, channel, reply_status, summary in REPLIES:
                Reply.objects.create(
                    company=company, contact=contact, channel=channel,
                    status=reply_status, summary=summary,
                )
            PipelineRun.objects.create(
                triggered_by='seed',
                leads_created=0,
                potentials_created=0,
                replies_created=0,
                summary={'notes': ['Initial seed run — CRM populated from demo dataset'], 'agents': []},
            )
            ChatMessage.objects.get_or_create(
                role='ai',
                text='Responder online. I can summarize leads, draft outreach copy, or report on the last pipeline run.',
            )

            # --- EMAIL DRAFTS (OUTREACH) -----------------------------------
            lead_by_name = {l.company: l for l in Lead.objects.all()}
            EMAIL_DRAFTS = [
                {
                    'company': 'Acme Robotics',
                    'to_email': 'info@acmerobotics.io',
                    'subject': 'Quick idea for Acme Robotics',
                    'body': (
                        'Hi Acme Robotics team,\n\n'
                        'I was researching industrial automation companies and looked at '
                        'acmerobotics.io — a couple of things stood out:\n\n'
                        '• Not mobile-friendly (no viewport meta) → Mobile-first redesign offer\n'
                        '• Homepage loads slowly (4.2s) → performance audit: images, caching, CDN\n\n'
                        'We help teams fix exactly this (lead generation, outbound copywriting, '
                        'sales automation, pipeline consulting). '
                        'Worth a 15-minute call next week to walk through the top items?\n\n'
                        'Best,\nNorthstar Growth Partners'
                    ),
                    'findings': [
                        {'area': 'Mobile', 'severity': 'high',
                         'issue': 'Not mobile-friendly (no viewport meta).',
                         'recommendation': 'Mobile-first redesign offer — most of their traffic is on phones.'},
                        {'area': 'Performance', 'severity': 'medium',
                         'issue': 'Homepage loads slowly (4.2s).',
                         'recommendation': 'Propose a performance audit: image optimisation, caching, CDN.'},
                    ],
                    'status': EmailDraft.Statuses.DRAFT,
                },
                {
                    'company': 'Harbor & Co Catering',
                    'to_email': '',
                    'subject': 'Getting Harbor & Co Catering online',
                    'body': (
                        'Hi Harbor & Co team,\n\n'
                        'I couldn\'t find a working website for Harbor & Co Catering — which usually '
                        'means customers searching for you end up with competitors instead.\n\n'
                        'We build fast, search-ready sites for catering businesses '
                        '(lead generation, outbound copywriting, sales automation, pipeline consulting). '
                        'Would a 15-minute call next week be useful?\n\n'
                        'Best,\nNorthstar Growth Partners'
                    ),
                    'findings': [
                        {'area': 'Web presence', 'severity': 'high',
                         'issue': 'Has no website at all.',
                         'recommendation': 'Pitch an end-to-end website: domain, landing pages, SEO setup.'},
                    ],
                    'status': EmailDraft.Statuses.DRAFT,
                },
                {
                    'company': 'BlueRiver Finance',
                    'to_email': 'contact@blueriver.finance',
                    'subject': 'Quick idea for BlueRiver Finance',
                    'body': (
                        'Hi BlueRiver Finance team,\n\n'
                        'I was researching fintech lending companies and looked at blueriver.finance '
                        '— a couple of things stood out:\n\n'
                        '• Missing or too-short page title → on-page SEO: unique 50–60 char titles\n'
                        '• Homepage loads slowly → performance audit: images, caching, CDN\n\n'
                        'We help teams fix exactly this. Worth a 15-minute call next week?\n\n'
                        'Best,\nNorthstar Growth Partners'
                    ),
                    'findings': [
                        {'area': 'SEO', 'severity': 'high',
                         'issue': 'Missing or too-short page title.',
                         'recommendation': 'Pitch on-page SEO: unique 50–60 char titles per page.'},
                    ],
                    'status': EmailDraft.Statuses.SENT,
                    'sent_via': EmailDraft.Via.CONSOLE,
                },
            ]
            for draft_data in EMAIL_DRAFTS:
                lead = lead_by_name.get(draft_data['company'])
                EmailDraft.objects.create(
                    lead=lead,
                    company=draft_data['company'],
                    to_email=draft_data['to_email'],
                    subject=draft_data['subject'],
                    body=draft_data['body'],
                    findings=draft_data['findings'],
                    status=draft_data['status'],
                    sent_via=draft_data.get('sent_via', ''),
                )

        self.stdout.write(self.style.SUCCESS('Seed complete.'))
        self.stdout.write(f'  Demo user : {DEMO_USERNAME} / {DEMO_PASSWORD} (role: owner)')
        self.stdout.write(f'  API token : {token.key}')
