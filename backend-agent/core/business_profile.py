"""Business-profile inference — the AI that reads a company's website and
works out what it sells and WHO BUYS from it.

Used by the first-login wizard (paste a domain → both setup cards fill),
Settings → Fetch, "who should I find?" in chat and the wizard's last step.
The result is always SAVED into the settings; the search itself never calls
the model and never guesses (core.lead_gate keeps lead finding off until
Who to find is saved).

The local model is deliberately not free here. Measured on real sites, a
1.7B model asked open questions invented countries and copied the prompt's
own examples as "customers" — confidently wrong targeting would then drive
the pipeline. So:
  * services        — the model's reading of the page (far better than the
                      heading/JSON-LD heuristics, which stay as the fallback);
  * buyers          — CHOSEN from the fixed catalogue below (schema-locked),
                      minus the seller's own kind, the 3 best;
  * countries       — never from the model: only the domain's country TLD.
A workspace whose customers are individuals gets no invented company leads.
"""

import logging
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .ai import llm_json
from .company_scrape import (BadUrl, company_details, fetch_public, normalize_url,
                             visible_text)
from .icp import competitor_regexes
from .models import AppSettings
from .scraper import MAX_HTML, _registrable, name_from_domain

log = logging.getLogger(__name__)

MAX_BUYERS = 3               # 3 solid kinds: on real sites the model's 4th pick was regularly weak
MAX_SERVICES = 6
BRIEF_TEXT_CHARS = 2200
MAX_HEADING_CHARS = 90
MAX_HEADINGS = 18
IDEAL_CLIENT_CHARS = 240

# Who to look for. These become search queries ('<kind> in <region>'), so
# every entry is an organisation kind that has its own website.
CATALOGUE_GROUPS = {
    'General business': ['small business', 'startup', 'mid-sized company', 'large enterprise',
                         'family business', 'nonprofit organization', 'cooperative society'],
    'Technology': ['software company', 'IT services company', 'web design agency',
                   'digital marketing agency', 'app development company', 'tech startup',
                   'data analytics company', 'cybersecurity company', 'coworking space'],
    'Education and research': ['school', 'college', 'university', 'training institute',
                               'coaching center', 'online course provider', 'research institute',
                               'research laboratory'],
    'Healthcare': ['dental clinic', 'medical clinic', 'hospital', 'veterinary clinic', 'pharmacy',
                   'physiotherapy clinic', 'mental health clinic', 'diagnostic center',
                   'nursing home', 'home care agency'],
    'Retail': ['e-commerce store', 'online store', 'retail store', 'boutique', 'supermarket',
               'shopping mall', 'wholesale distributor', 'dealer'],
    'Food and hospitality': ['restaurant', 'cafe', 'bakery', 'catering company',
                             'food processing company', 'hotel', 'resort', 'travel agency',
                             'tour operator', 'event management company', 'wedding planner',
                             'event venue'],
    'Wellness and beauty': ['gym', 'fitness studio', 'yoga studio', 'beauty salon', 'spa',
                            'barber shop', 'tattoo studio'],
    'Professional services': ['law firm', 'accounting firm', 'insurance agency',
                              'real estate agency', 'architecture firm', 'interior design firm',
                              'engineering consultancy', 'business consulting firm',
                              'recruitment agency', 'staffing agency', 'financial advisory firm',
                              'audit firm', 'tax consultancy', 'property management company',
                              'real estate developer'],
    'Trades and local services': ['construction company', 'contractor', 'landscaping company',
                                  'cleaning service', 'pest control service', 'moving company',
                                  'courier service', 'logistics company', 'auto repair shop',
                                  'car dealership', 'driving school', 'printing company',
                                  'packaging company', 'security agency',
                                  'solar installation company'],
    'Industry and manufacturing': ['manufacturing company', 'factory', 'textile company',
                                   'garment manufacturer', 'jewellery store',
                                   'electronics company', 'pharmaceutical company',
                                   'biotech company', 'medical device company',
                                   'agricultural farm', 'dairy farm', 'food distributor',
                                   'import export company', 'trading company',
                                   'automotive company', 'chemical company', 'energy company',
                                   'industrial equipment supplier',
                                   'construction materials supplier',
                                   'furniture manufacturer'],
    'Media and creative': ['publishing house', 'media company', 'news website',
                           'advertising agency', 'PR agency', 'video production company',
                           'photography studio', 'animation studio', 'translation agency'],
    'Finance': ['bank', 'fintech company', 'insurance company', 'investment firm',
                'microfinance institution', 'payment company'],
    'Public and social': ['government office', 'municipal corporation',
                          'public sector unit', 'NGO', 'religious organization',
                          'foundation', 'trade association', 'chamber of commerce'],
    'Personal services': ['daycare', 'preschool', 'senior living facility',
                          'pet grooming service', 'immigration consultant', 'tutoring service'],
}
CATALOGUE = [kind for kinds in CATALOGUE_GROUPS.values() for kind in kinds]
_CANONICAL = {kind.lower(): kind for kind in CATALOGUE}

# Country-code TLD → the scraper's own region name (so the sweep accepts it).
# Two-level suffixes are checked before one-level ones. TLDs that double as
# generic addresses (.co, .io, .ai, .me, .md) are deliberately absent.
CCTLD_COUNTRY = {
    'in': 'India', 'co.in': 'India',
    'uk': 'United Kingdom', 'co.uk': 'United Kingdom', 'ie': 'Ireland',
    'au': 'Australia', 'com.au': 'Australia', 'nz': 'New Zealand', 'co.nz': 'New Zealand',
    'ca': 'Canada', 'us': 'United States', 'mx': 'Mexico', 'com.mx': 'Mexico',
    'de': 'Germany', 'fr': 'France', 'nl': 'Netherlands', 'es': 'Spain', 'it': 'Italy',
    'pt': 'Portugal', 'be': 'Belgium', 'ch': 'Switzerland', 'at': 'Austria',
    'se': 'Sweden', 'no': 'Norway', 'dk': 'Denmark', 'fi': 'Finland', 'is': 'Iceland',
    'pl': 'Poland', 'cz': 'Czech Republic', 'sk': 'Slovakia', 'hu': 'Hungary',
    'ro': 'Romania', 'bg': 'Bulgaria', 'gr': 'Greece', 'hr': 'Croatia', 'si': 'Slovenia',
    'rs': 'Serbia', 'ua': 'Ukraine', 'ee': 'Estonia', 'lv': 'Latvia', 'lt': 'Lithuania',
    'lu': 'Luxembourg', 'mt': 'Malta', 'cy': 'Cyprus', 'al': 'Albania',
    'mk': 'North Macedonia', 'ba': 'Bosnia and Herzegovina',     'cr': 'Costa Rica', 'pa': 'Panama', 'gt': 'Guatemala', 'hn': 'Honduras',
    'sv': 'El Salvador', 'ni': 'Nicaragua', 'do': 'Dominican Republic', 'jm': 'Jamaica',
    'tt': 'Trinidad and Tobago', 'pr': 'Puerto Rico',
    'br': 'Brazil', 'com.br': 'Brazil', 'ar': 'Argentina', 'cl': 'Chile', 'pe': 'Peru',
    'ec': 'Ecuador', 'uy': 'Uruguay', 'py': 'Paraguay', 'bo': 'Bolivia', 've': 'Venezuela',
    'cn': 'China', 'jp': 'Japan', 'co.jp': 'Japan', 'kr': 'South Korea', 'tw': 'Taiwan',
    'hk': 'Hong Kong', 'sg': 'Singapore', 'my': 'Malaysia', 'th': 'Thailand', 'vn': 'Vietnam',
    'ph': 'Philippines', 'id': 'Indonesia', 'pk': 'Pakistan', 'bd': 'Bangladesh',
    'lk': 'Sri Lanka', 'np': 'Nepal', 'kh': 'Cambodia', 'mm': 'Myanmar', 'mn': 'Mongolia',
    'kz': 'Kazakhstan', 'uz': 'Uzbekistan', 'az': 'Azerbaijan', 'il': 'Israel',
    'ae': 'UAE', 'sa': 'Saudi Arabia', 'qa': 'Qatar', 'kw': 'Kuwait', 'bh': 'Bahrain',
    'om': 'Oman', 'jo': 'Jordan', 'lb': 'Lebanon', 'tr': 'Turkey',
    'za': 'South Africa', 'co.za': 'South Africa', 'ng': 'Nigeria', 'ke': 'Kenya',
    'eg': 'Egypt', 'ma': 'Morocco', 'gh': 'Ghana', 'tz': 'Tanzania', 'ug': 'Uganda',
    'et': 'Ethiopia', 'rw': 'Rwanda', 'zm': 'Zambia', 'zw': 'Zimbabwe', 'bw': 'Botswana',
    'na': 'Namibia', 'mz': 'Mozambique', 'sn': 'Senegal', 'ci': 'Ivory Coast',
    'cm': 'Cameroon', 'tn': 'Tunisia', 'dz': 'Algeria', 'mu': 'Mauritius', 'ao': 'Angola',
    'mw': 'Malawi', 'ly': 'Libya', 'fj': 'Fiji', 'pg': 'Papua New Guinea',
}

_SCHEMA = {
    'type': 'object',
    'properties': {
        'services': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 3, 'maxItems': 6},
        'customer_type': {'type': 'string', 'enum': ['organisations', 'individuals', 'both']},
        # 'other' spares a seller whose kind is not in the catalogue from a
        # forced wrong pick (which would then wrongly drop that buyer kind)
        'own_kind': {'type': 'string', 'enum': CATALOGUE + ['other']},
        'buyers': {'type': 'array', 'items': {'type': 'string', 'enum': CATALOGUE},
                   'maxItems': MAX_BUYERS},
        'ideal_client': {'type': 'string'},
    },
    'required': ['services', 'customer_type', 'own_kind', 'buyers', 'ideal_client'],
}

_SYSTEM = ('You are a careful business analyst. You read a company website and answer '
           'with facts taken from the text. Answer with JSON only.')


# ------------------------------------------------------------------
# Deterministic pieces
# ------------------------------------------------------------------

def country_from_domain(domain):
    """The country a domain's country-code TLD implies, in the scraper's own
    region naming — '' for worldwide addresses (.com, .org, .io…)."""
    host = (domain or '').strip().lower().rstrip('.')
    host = host.removeprefix('www.')
    parts = host.split('.')
    if len(parts) >= 3 and '.'.join(parts[-2:]) in CCTLD_COUNTRY:
        return CCTLD_COUNTRY['.'.join(parts[-2:])]
    return CCTLD_COUNTRY.get(parts[-1], '') if len(parts) >= 2 else ''


def page_brief(html):
    """What the model sees of a page: title, description, section headings and
    the visible text — scripts and navigation chrome removed."""
    soup = BeautifulSoup(html or '', 'lxml')

    def meta(name=None, property=None):
        tag = soup.find('meta', attrs={'name': name} if name else {'property': property})
        return (tag.get('content') or '').strip() if tag else ''

    title = (soup.title.string or '').strip() if soup.title and soup.title.string else ''
    headings = [re.sub(r'\s+', ' ', h.get_text(' ', strip=True))
                for h in soup.find_all(['h1', 'h2', 'h3'])]
    headings = [h for h in headings if 2 < len(h) <= MAX_HEADING_CHARS][:MAX_HEADINGS]
    return {'title': title[:160],
            'description': meta(name='description') or meta(property='og:description'),
            'headings': headings,
            'text': visible_text(html, body_only=True)[:BRIEF_TEXT_CHARS]}


def normalize_inference(raw):
    """Clean, on-catalogue profile from a model reply — or None when the
    reply yields nothing usable (no services means the page was not
    understood, so its buyer guesses are not trusted either)."""
    if not isinstance(raw, dict):
        return None
    services = _clean_list(raw.get('services'), MAX_SERVICES, min_len=2)
    buyers = _clean_list(raw.get('buyers'), MAX_BUYERS, min_len=2, catalogue=True)
    own = str(raw.get('own_kind') or '').strip().lower()
    buyers = [b for b in buyers if b.lower() != own]
    if not services:
        return None
    kind = raw.get('customer_type')
    client = raw.get('ideal_client')
    return {'services': services,
            'buyers': buyers,
            'customer_type': kind if kind in ('organisations', 'individuals', 'both')
            else 'organisations',
            'ideal_client': (str(client).strip() if client is not None else '')[:IDEAL_CLIENT_CHARS]}


def _clean_list(values, cap, min_len, catalogue=False):
    """Strings only, trimmed, length-bounded, de-duplicated; with `catalogue`
    only catalogue entries survive, in the catalogue's own spelling."""
    out, seen = [], set()
    for v in values if isinstance(values, list) else []:
        if not isinstance(v, str):
            continue
        v = v.strip()
        if not min_len < len(v) <= 60:
            continue
        if catalogue:
            v = _CANONICAL.get(v.lower())
            if not v:
                continue
        if v.lower() in seen:
            continue
        seen.add(v.lower())
        out.append(v)
        if len(out) >= cap:
            break
    return out


# ------------------------------------------------------------------
# The model
# ------------------------------------------------------------------

def _build_prompt(brief):
    catalogue = '\n'.join(f'{group}: ' + ', '.join(kinds)
                          for group, kinds in CATALOGUE_GROUPS.items())
    headings = '\n'.join(f'- {h}' for h in brief['headings'])
    return (
        'A company website says:\n\n'
        f'TITLE: {brief["title"]}\n'
        f'DESCRIPTION: {brief["description"]}\n'
        f'SECTION HEADINGS:\n{headings}\n'
        f'PAGE TEXT:\n{brief["text"]}\n\n'
        'Answer these questions about THIS company. Fill the JSON:\n'
        '1. "services": 3 to 6 short things this company itself sells or offers '
        '(2 to 5 words each).\n'
        '2. "customer_type": who pays this company money. "organisations" = companies, '
        'institutions, offices. "individuals" = single people such as patients, shoppers, '
        'guests, readers. "both" = mixed.\n'
        '3. "own_kind": the ONE catalogue entry that best describes THIS company itself. '
        'Use "other" if none fits.\n'
        '4. "buyers": if other organisations would buy from this company, choose the 3 '
        'BEST kinds from the catalogue. Copy the names exactly. Choose ONLY '
        'organisations that would benefit from the services. Never the company\'s own kind. '
        'If its customers are individuals and no organisation would buy, use [].\n'
        '5. "ideal_client": one sentence describing the ideal customer.\n'
        f'CATALOGUE:\n{catalogue}\n'
    )


def infer_profile(brief):
    """One model call → normalised profile (services, buyers, customer type,
    ideal client), or None when the model is unavailable or unreliable."""
    raw = llm_json(system=_SYSTEM, prompt=_build_prompt(brief), schema=_SCHEMA, max_tokens=220)
    return normalize_inference(raw)


# ------------------------------------------------------------------
# Domain → profile (wizard + Settings → Fetch)
# ------------------------------------------------------------------

def profile_from_domain(domain):
    """Read a company's site and work out its profile. The page facts
    (name, description, address) always come from the page; the model adds
    what it sells and who buys. Raises BadUrl when the site cannot be read,
    so callers never pretend to have read it."""
    site = normalize_url(domain)
    host = re.sub(r'^www\.', '', (urlparse(site).hostname or '').lower())
    resp = fetch_public(site)
    if resp.status_code != 200:
        raise BadUrl(f'That website answered HTTP {resp.status_code}.')
    html = resp.text[:MAX_HTML]
    found = company_details(html, resp.url)
    country = country_from_domain(host)
    profile = {
        'domain': host,
        'name': found['name'] or name_from_domain(_registrable(host)),
        'description': found['description'],
        'address': found['address'],
        'services': [s for s in found['services'] if 2 < len(s) <= 60][:MAX_SERVICES],
        'customer_type': '',
        'target_industries': [],
        'target_countries': [country] if country else [],
        'target_cities': [],
        'icp_notes': '',
        'inferred': False,
    }
    inferred = infer_profile(page_brief(html))
    if inferred:
        profile.update(inferred=True,
                       services=inferred['services'],
                       customer_type=inferred['customer_type'],
                       icp_notes=inferred['ideal_client'])
        if inferred['customer_type'] in ('organisations', 'both'):
            profile['target_industries'] = inferred['buyers']
    return profile


def apply_profile(settings, profile):
    """Write a profile onto the workspace settings (and save). Targeting is
    only written when the profile actually inferred leads — a business whose
    customers are individuals keeps whatever 'Who to find' it already has.
    Returns short human-readable lines for the chat reply."""
    fields = {
        'company_name': profile.get('name') or settings.company_name,
        'company_website': profile.get('domain') or settings.company_website,
        'company_description': profile.get('description') or settings.company_description,
        'company_address': (profile.get('address') or settings.company_address or '')[:300],
        'services': profile.get('services') or settings.services or [],
    }
    leads = [i for i in profile.get('target_industries') or [] if i]
    if leads:
        fields['target_industries'] = ', '.join(leads)
        if profile.get('target_countries'):
            fields['target_countries'] = ', '.join(profile['target_countries'])
        fields['icp_notes'] = (profile.get('icp_notes') or '')[:6000]
    for field, value in fields.items():
        setattr(settings, field, value)
    settings.save(update_fields=[*fields, 'updated_at'])

    lines = [f'company name: {settings.company_name}',
             f'website: {settings.company_website}']
    if settings.services:
        lines.append('what you sell: ' + ', '.join(settings.services))
    if settings.company_address:
        lines.append('address: ' + settings.company_address)
    if leads:
        where = settings.target_countries or 'worldwide'
        lines.append(f'who I\'ll look for: {", ".join(leads)} — in {where}')
    return lines


# ------------------------------------------------------------------
# Pipeline fallback: buyers for a workspace that never set 'Who to find'
# ------------------------------------------------------------------

def settings_brief(settings):
    """The same page-brief shape, built from what the workspace says about
    itself — plus its homepage text when the site can be read."""
    def one_line(value, limit):
        return re.sub(r'\s+', ' ', value or '').strip()[:limit]

    services = ', '.join(one_line(s, 60) for s in (settings.services or []))
    own = []
    if settings.company_name:
        own.append(f'Company: {one_line(settings.company_name, 120)}')
    if services:
        own.append(f'What it sells: {services}')
    if settings.company_description:
        own.append(one_line(settings.company_description, 600))
    brief = {'title': one_line(settings.company_name, 160),
             'description': one_line(settings.company_description, 300),
             'headings': [], 'text': ' '.join(own)[:BRIEF_TEXT_CHARS]}
    if not (settings.company_website or '').strip():
        return brief
    try:
        resp = fetch_public(normalize_url(settings.company_website))
        if resp.status_code != 200:
            return brief
        site = page_brief(resp.text[:MAX_HTML])
    except Exception as exc:       # dead site, blocked, bad address — the local facts still count
        log.info('Homepage unreadable for buyer inference: %s', type(exc).__name__)
        return brief
    return {'title': site['title'] or brief['title'],
            'description': site['description'] or brief['description'],
            'headings': site['headings'],
            'text': (site['text'] + ' ' + brief['text']).strip()[:BRIEF_TEXT_CHARS]}


def analyse_buyers(settings, about=''):
    """Who buys from this workspace, worked out by the model from what it
    does: its own profile (and homepage when it can be read) plus anything
    the owner just said it sells (`about`). Returns {'buyers',
    'ideal_client', 'services', 'customer_type'} — or None when there is
    nothing to go on or the model cannot tell."""
    brief = settings_brief(settings)
    if about and about.strip():
        said = ' '.join(about.split())[:900]
        brief = {**brief, 'text': f'{said} {brief["text"]}'[:BRIEF_TEXT_CHARS],
                 'description': (said + ' ' + brief['description'])[:300]}
    if not brief['text'].strip():
        return None
    inferred = infer_profile(brief)
    if inferred is None:
        return None            # model unavailable — callers must not guess
    buyers = inferred['buyers'] if inferred['customer_type'] in ('organisations', 'both') else []
    return {'buyers': buyers,
            'ideal_client': inferred['ideal_client'],
            'services': inferred['services'],
            'customer_type': inferred['customer_type']}


def plan_targeting(about=''):
    """What 'Who to find' should be for this workspace, as a plan the owner
    can accept: {'buyers', 'countries', 'ideal', 'individuals', 'services'}
    or None when nothing could be worked out. Countries come only from the
    domain's own country code, and the workspace's own kind is never a
    buyer (same guards as the search itself). The result is SAVED into Who
    to find by the caller; the search itself never calls the model."""
    settings = AppSettings.load()
    found = analyse_buyers(settings, about=about)
    if not found:
        return None
    guards = list(competitor_regexes(settings))
    return {'buyers': [b for b in found['buyers'] if not any(g.search(b) for g in guards)],
            'countries': [c for c in (country_from_domain(settings.company_website or ''),) if c],
            'ideal': found['ideal_client'],
            'individuals': found['customer_type'] == 'individuals',
            'services': found['services']}
