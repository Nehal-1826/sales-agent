"""ICP (Ideal Customer Profile) engine — WHO to search for, WHO to reject.

Fixes the "the agent brings competitors, not leads" failure mode: the old
discovery rotated a fixed industry list ('web design agency', 'digital
marketing agency', 'IT consulting firm', …).  For a seller of web / marketing
/ software services those queries return PEER AGENCIES — the user's own
competitors — instead of businesses that BUY those services.

This module reads the user's Company Profile (name + services + description)
and answers three questions for the pipeline:

    1.  vertical(settings)        → what WE sell ('web_services' / 'generic')
    2.  buyer_industries(settings)→ the industries to SEARCH — operating
                                    businesses that buy what we sell
    3.  looks_like_competitor(...)→ fast heuristic gate applied to every
                                    discovered lead, works with NO AI key

The user can override the industry list any time in Settings → Lead
Targeting (target_industries) — those are used verbatim.
"""

import re

log = __import__('logging').getLogger(__name__)

# --- What WE sell ------------------------------------------------------------
# Signals that the user's company is in the web / marketing / software
# business — for such a seller, "web design agency" is a COMPETITOR query and
# "dental clinic" is a BUYER query.
WEB_SELLER_SIGNALS = re.compile(
    r'\bweb\s*(design|development|dev|site|agency|studio)\b|'
    r'\bwebsite[s]?\b|'
    r'\bseo\b|\bsearch engine optimization\b|'
    r'\bdigital marketing\b|\bonline marketing\b|\bmarketing\s*(agency|services)\b|'
    r'\bbranding\b|\bgraphic design\b|'
    r'\bsoftware\b|\bapp development\b|\bmobile app\b|\bit services\b|\bit consulting\b|'
    r'\bsaas\b|\bcrm\b|\be[- ]commerce (development|store setup)\b|'
    r'\bwordpress\b|\bshopify\b|\bhosting\b|\bui/?ux\b',
    re.I)

# --- Competitor fingerprints -------------------------------------------------
# Matched against a lead's company NAME, industry and AI description.  A hit
# in the NAME or industry is decisive; description hits need two distinct
# patterns (a dentist's site may mention "SEO" once without being an agency).
COMPETITOR_PATTERNS = [re.compile(p, re.I) for p in (
    r'\bweb\s*(design|designer|designers|development|developer|developers|dev|devs|'
    r'agency|agencies|studio|company|firm|service|services|solution|solutions)\b',
    r'\bwebsite\s*(design|designer|development|developer|builder|builders|agency|'
    r'company|services?)\b',
    r'\bwebs?ite\s*(building|making|creation)\b',
    r'\bwordpress\b|\bshopify\b|\bwix\b|\bwebflow\b|\bsquarespace\b|\bmagento\b',
    r'\bseo\b|\bsearch engine optimization\b|\bserp\b',
    r'\bdigital marketing\b|\bonline marketing\b|\binternet marketing\b|'
    r'\bperformance marketing\b|\bgrowth marketing\b|\bperformance agency\b',
    r'\bmarketing\s*(agency|agencies|consultanc\w*|firm|company|partner|services?|team)\b',
    r'\bsocial media\s*(agency|agencies|marketing|management|services?)\b',
    r'\bcontent marketing\b|\binbound marketing\b|\blead generation\b|\bemail marketing\b',
    r'\bbranding\s*(agency|agencies|studio|firm|services?)\b|'
    r'\bcreative\s*(agency|agencies|studio)\b|\badvertising agency\b|\bad\s*agency\b',
    r'\bppc\b|\bgoogle ads\b|\bmeta ads\b|\bfacebook ads\b|\bpaid media\b',
    r'\bapp\s*(development|developer|developers|agency|agencies|company|firm|studio)\b|'
    r'\bmobile\s*(app|application)\s*(development|developer|developers|agency|company)\b',
    r'\bsoftware\s*(house|development|developer|developers|company|agency|consulting|'
    r'services?|solutions?|firm)\b',
    r'\bit\s*(consulting|consultancy|services|solutions|company|outsourcing|support)\b',
    r'\bweb\s*hosting\b|\bhosting\s*(provider|company|services?)\b|\bdomain\s*registrar\b',
    r'\bui\s*/?\s*ux\b|\bux\s*/?\s*ui\b|\bux\s*design\b|\bui\s*design\b',
    r'\bgraphic\s*design\s*(agency|studio|service|services|company)\b',
    r'\bautomation\s*(agency|consulting|services?)\b|\bno[- ]code\s*(agency|developer)\b',
    r'\bcrm\b|\bsaas\b|\bwhite\s*label\b',
    r'\btech\s*(agency|consulting|consultancy)\b|\btechnology\s*(agency|consulting|'
    r'consultancy|partner)\b',
)]

# --- Buyer industries --------------------------------------------------------
# Operating businesses that BUY web design / marketing / software — the
# industries discovery actually searches.  Local, SMB-heavy, worldwide.
BUYER_INDUSTRIES = [
    'dental clinic', 'medical clinic', 'veterinary clinic', 'physiotherapy clinic',
    'boutique hotel', 'resort', 'fitness studio', 'gym', 'yoga studio',
    'restaurant', 'cafe', 'bakery', 'catering service',
    'boutique law firm', 'accounting firm', 'insurance agency', 'real estate agency',
    'construction company', 'architecture studio', 'interior design studio',
    'landscaping company', 'cleaning service company', 'security services company',
    'driving school', 'coaching center', 'playschool', 'daycare center',
    'beauty salon', 'spa', 'tattoo studio', 'photography studio',
    'event management company', 'travel agency', 'tour operator',
    'car dealership', 'auto repair shop', 'bike service center',
    'furniture store', 'jewellery store', 'optical store', 'pharmacy',
    'clothing boutique', 'bookstore', 'toy store',
    'logistics company', 'courier service', 'cold storage',
    'import export company', 'trading company',
    'organic farm', 'nursery and garden center', 'pet grooming service',
]

# Agencies/peers must never be searched even when the user overrides the
# industry list — a manual override of "web design agency" would reintroduce
# the exact bug this module fixes.
NEVER_SEARCH_INDUSTRIES = re.compile(
    r'web\s*design|web\s*development|digital marketing|marketing agency|seo agency|'
    r'software house|software development|app development|it consulting|it services|'
    r'web hosting|branding agency|creative agency|advertising agency|saas|crm|'
    r'social media agency|web agency|tech agency|ui\s*[/ ]?\s*ux|graphic design agency',
    re.I)


def vertical(settings):
    """'web_services' when the user's profile says they sell web / marketing /
    software; 'generic' otherwise.  Empty profile → web_services (this
    product's default seller persona)."""
    hay = ' '.join(filter(None, [
        getattr(settings, 'company_name', '') or '',
        ' '.join(settings.services or []),
        getattr(settings, 'company_description', '') or '',
    ]))
    if not hay.strip():
        return 'web_services'
    return 'web_services' if WEB_SELLER_SIGNALS.search(hay) else 'generic'


def competitor_regexes(settings):
    """Competitor fingerprints for this user.  Web sellers use the agency
    patterns; generic sellers only reject their own industry peers."""
    if vertical(settings) == 'web_services':
        return COMPETITOR_PATTERNS
    mine = (getattr(settings, 'company_name', '') or '').strip().lower()
    if not mine:
        return []
    # generic vertical: only exact-name peers (plus its own name) are competitors
    return [re.compile(re.escape(mine), re.I)]


def buyer_industries(settings):
    """Industries the discovery sweep searches, in priority order.

    1. user override (Settings → Lead Targeting → target industries), minus
       agency/peer terms that would reintroduce competitors;
    2. otherwise the built-in buyer list for our vertical."""
    raw = (getattr(settings, 'target_industries', '') or '').strip()
    if raw:
        picked = [i.strip() for i in re.split(r'[,\n]', raw) if i.strip()]
        safe = [i for i in picked if not NEVER_SEARCH_INDUSTRIES.search(i)]
        dropped = len(picked) - len(safe)
        if dropped:
            log.info('ICP: dropped %d user industry override(s) as peer/agency terms', dropped)
        return safe or BUYER_INDUSTRIES
    return BUYER_INDUSTRIES


def our_services_text(settings):
    """'web design, SEO' — fed to the AI relevance gate so Gemini can tell a
    competitor ('we build websites') from a buyer ('dental clinic')."""
    services = ', '.join(settings.services or [])
    if not services and vertical(settings) == 'web_services':
        services = 'web design, SEO and online marketing'
    return services or 'our services'


def looks_like_competitor(lead, settings):
    """Fast heuristic — is this lead a peer agency / the user's own kind of
    business instead of a prospective BUYER?  Works without any AI key.

    Signals checked: the lead's company name, its industry tag, the AI/site
    description and the SERP snippet.  Name/industry hits are decisive;
    free-text hits need two distinct patterns (a clinic site can mention
    'SEO' without being an agency)."""
    patterns = competitor_regexes(settings)
    if not patterns:
        return False
    # our own domain/company must never end up in the CRM as a "lead" —
    # normalize both sides to bare domains first: the lead's website can
    # arrive with scheme/path ('https://www.shailog.com/about')
    def _bare_domain(url):
        d = (url or '').strip().lower()
        for prefix in ('https://', 'http://'):
            if d.startswith(prefix):
                d = d[len(prefix):]
        d = d.split('/', 1)[0]
        return d[4:] if d.startswith('www.') else d
    own_domain = _bare_domain(getattr(settings, 'company_website', ''))
    own_name = (getattr(settings, 'company_name', '') or '').lower()
    website = _bare_domain(
        lead.get('website') if isinstance(lead, dict) else getattr(lead, 'website', ''))
    name = ((lead.get('company') if isinstance(lead, dict) else getattr(lead, 'company', '')) or '').strip()
    if own_domain and website and (website == own_domain
                                   or own_domain.endswith('.' + website)
                                   or website.endswith('.' + own_domain)):
        return True
    if own_name and name.lower() == own_name:
        return True

    industry = ((lead.get('industry') if isinstance(lead, dict) else getattr(lead, 'industry', '')) or '')
    desc = ((lead.get('description') if isinstance(lead, dict) else getattr(lead, 'description', '')) or '')
    snippet = ''
    analysis = lead.get('analysis') if isinstance(lead, dict) else getattr(lead, 'analysis', None)
    if isinstance(analysis, dict):
        snippet = analysis.get('serp_snippet') or ''

    if name:
        for p in patterns:
            if p.search(name):
                return True
    if industry:
        for p in patterns:
            if p.search(industry):
                return True
    free_text_hits = {p.pattern for p in patterns
                      if (desc and p.search(desc)) or (snippet and p.search(snippet))}
    return len(free_text_hits) >= 2
