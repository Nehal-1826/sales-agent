"""
Search (Scrape) + Profile agent plumbing — real implementation.

    search_companies()      → DuckDuckGo web search (ddgs), no API key needed
    scrape_company()        → plain HTTP fetch with a time budget
    extract_contact_email() → mailto:/regex scan of the homepage + contact page
    analyze_website()       → heuristic audit → findings + potential score

Scoring model: the score is the SALES POTENTIAL of the company — the more
fixable flaws their web presence has, the better the prospect.  A missing or
unreachable website is the strongest signal of all.
"""

import logging
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
)
FETCH_TIMEOUT = 12          # seconds per page
MAX_HTML = 900_000          # cap page size we parse
CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/impressum']

# Domains that are directories/socials/platforms/job boards, never the
# small-to-mid company we're hunting for.
BLOCKED_DOMAINS = {
    'wikipedia.org', 'facebook.com', 'linkedin.com', 'instagram.com', 'x.com',
    'twitter.com', 'youtube.com', 'yelp.com', 'tripadvisor.com', 'reddit.com',
    'medium.com', 'github.com', 'amazon.com', 'google.com', 'apple.com',
    'microsoft.com', 'britannica.com', 'quora.com', 'pinterest.com', 'tiktok.com',
    'crunchbase.com', 'bloomberg.com', 'forbes.com', 'indeed.com', 'glassdoor.com',
    'booking.com', 'expedia.com', 'trustpilot.com', 'justdial.com',
    # e-commerce / site platforms
    'shopify.com', 'woocommerce.com', 'wix.com', 'squarespace.com', 'wordpress.com',
    'wordpress.org', 'bigcommerce.com', 'etsy.com', 'ebay.com', 'alibaba.com',
    'aliexpress.com', 'temu.com', 'shein.com', 'magento.com', 'shopware.com',
    # job boards / career aggregators
    'arbeitnow.com', 'stepstone.de', 'xing.com', 'kununu.com', 'jooble.org',
    'adzuna.com', 'monster.com', 'arbeitsagentur.de', 'absolventa.de',
    'ausbildung.de', 'jobs.de', 'jobware.de', 'yourfirm.de',
    'themuse.com', 'zippia.com', 'careerbuilder.com', 'ziprecruiter.com',
    # directories / listicles
    'designrush.com', 'clutch.co', 'upwork.com', 'fiverr.com', 'g2.com',
    'capterra.com', 'yellowpages.com', 'gelbeseiten.de',
    '11880.com', 'dasoertliche.de', 'hotfrog.com', 'brownbook.net',
    'builtin.com', 'wellfound.com', 'angellist.com', 'layoffdata.com',
    # giant enterprises — never prospects
    'salesforce.com', 'hubspot.com', 'adobe.com', 'ibm.com', 'oracle.com', 'sap.com',
    'deloitte.com', 'pwc.com', 'ey.com', 'kpmg.com', 'accenture.com', 'mckinsey.com',
    'bcg.com', 'bain.com', 'siemens.com', 'bosch.com', 'telekom.com',
    'walmart.com', 'target.com', 'ikea.com', 'zara.com', 'hm.com',
    'zalando.com', 'aboutyou.com', 'otto.de', 'aldi.com', 'lidl.com', 'rewe.de',
}

# Worldwide rotation: industries × regions, one slice per pipeline cycle.
INDUSTRY_QUERIES = [
    'web design agency', 'digital marketing agency', 'SaaS startup',
    'e-commerce brand', 'boutique law firm', 'dental clinic', 'real estate agency',
    'construction company', 'boutique hotel', 'fitness studio', 'IT consulting firm',
    'restaurant group', 'logistics company', 'architecture studio',
]
REGIONS = ['Germany', 'United Kingdom', 'United States', 'India', 'Netherlands',
           'Canada', 'Australia', 'Singapore', 'UAE', 'South Africa', 'Ireland', 'Spain']

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
EMAIL_JUNK = re.compile(r'\.(png|jpg|jpeg|gif|webp|svg|css|js)$', re.I)


def search_query_for_cycle(cycle_index):
    """Industry × region pair for the Nth cycle, worldwide rotation."""
    industry = INDUSTRY_QUERIES[cycle_index % len(INDUSTRY_QUERIES)]
    region = REGIONS[(cycle_index // len(INDUSTRY_QUERIES)) % len(REGIONS)]
    return f'{industry} in {region}', industry


# Region detection — state + country for each lead, from the discovery query
# (e.g. 'dental clinic Salem Tamil Nadu') with the site TLD as fallback.
CITY_STATE = {
    'salem': 'Tamil Nadu', 'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu',
    'madurai': 'Tamil Nadu', 'trichy': 'Tamil Nadu', 'erode': 'Tamil Nadu',
    'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra',
    'bengaluru': 'Karnataka', 'bangalore': 'Karnataka', 'mysuru': 'Karnataka',
    'hyderabad': 'Telangana', 'delhi': 'Delhi', 'noida': 'Uttar Pradesh',
    'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'jaipur': 'Rajasthan',
    'kolkata': 'West Bengal', 'kochi': 'Kerala', 'visakhapatnam': 'Andhra Pradesh',
}
TLD_COUNTRY = {
    '.in': 'India', '.de': 'Germany', '.uk': 'United Kingdom', '.us': 'United States',
    '.au': 'Australia', '.ca': 'Canada', '.nl': 'Netherlands', '.sg': 'Singapore',
    '.ae': 'UAE', '.ie': 'Ireland', '.es': 'Spain', '.za': 'South Africa',
}


def region_from_query(query, website=''):
    """Guess (state, country) from the discovery query, falling back to the site TLD."""
    q = (query or '').lower()
    state = country = ''
    for city, st in CITY_STATE.items():
        if city in q:
            state, country = st, 'India'
            break
    if not country:
        for region in REGIONS:
            if region.lower() in q:
                country = region
                break
    if not country and website:
        site = website.lower().rstrip('/')
        for tld, c in TLD_COUNTRY.items():
            if site.endswith(tld) or f'{tld}/' in site:
                country = c
                break
    return state, country


def name_from_domain(domain):
    """'mabya.com' → 'Mabya' — clean fallback when the result title is garbage."""
    base = domain.split('.')[0]
    return base[:1].upper() + base[1:] if base else domain


def _plausible_company_name(name, domain):
    """Reject garbled SERP titles ('Buy or acquire E', sentences, one-liners)."""
    if not name or len(name) < 4 or len(name) > 60:
        return False
    if any(len(w) == 1 for w in name.split() if w.lower() not in ('a', '&')):  # '…acquire E'
        return False
    if re.search(r'\b(acquire|buy|sale|for sale|jobs?|career|hiring|review|best|top \d+)\b', name, re.I):
        return False
    return True


def search_companies(query, n=8):
    """Real DuckDuckGo search → [{name, website, snippet}] for company homepages."""
    from ddgs import DDGS

    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=n * 4):
                url = (r.get('href') or r.get('url') or '').strip()
                if not url:
                    continue
                parsed = urlparse(url)
                domain = parsed.netloc.lower()
                domain = domain[4:] if domain.startswith('www.') else domain
                if not domain or any(domain == b or domain.endswith('.' + b) for b in BLOCKED_DOMAINS):
                    continue
                if domain.endswith(('.gov', '.gov.uk', '.mil', '.edu', '.ac.uk')):  # institutions
                    continue
                path = parsed.path or '/'
                # deep links are job listings / articles, not company homepages
                if len(path) > 40 or path.count('/') > 2 or '?' in url:
                    continue
                title = (r.get('title') or '').strip()
                # 'Company Name | Services…' / 'Company Name — Home' → keep the brand part
                name = re.split(r'\s*[|–—·-]\s*', title)[0].strip()
                if not _plausible_company_name(name, domain):
                    name = name_from_domain(domain)
                results.append({'name': name, 'website': domain, 'snippet': r.get('body', '')[:200]})
                if len(results) >= n:
                    break
    except Exception as exc:  # network hiccup, rate limit — never kill a cycle
        log.warning('DDG search failed for %r: %s', query, exc)
    return results


def scrape_company(url):
    """Fetch a page. Returns {ok, status, final_url, https, load_ms, html, error}."""
    if not url.startswith('http'):
        url = 'https://' + url
    t0 = time.time()
    try:
        resp = requests.get(
            url,
            headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en;q=0.9,*;q=0.5'},
            timeout=FETCH_TIMEOUT,
            allow_redirects=True,
        )
        load_ms = int((time.time() - t0) * 1000)
        html = (resp.text or '')[:MAX_HTML]
        return {
            'ok': resp.status_code == 200,
            'status': resp.status_code,
            'final_url': resp.url,
            'https': resp.url.startswith('https://'),
            'load_ms': load_ms,
            'html': html,
            'error': '',
        }
    except requests.RequestException as exc:
        load_ms = int((time.time() - t0) * 1000)
        return {
            'ok': False, 'status': 0, 'final_url': url,
            'https': url.startswith('https://'), 'load_ms': load_ms,
            'html': '', 'error': str(exc)[:200],
        }


def _clean_email(candidate):
    candidate = candidate.strip().strip('.').lower()
    if EMAIL_JUNK.search(candidate):
        return ''
    if any(b in candidate for b in ('example.com', 'sentry.io', 'wixpress', '@2x', 'domain.com')):
        return ''
    return candidate


def extract_contact_email(html, base_url, soup=None):
    """mailto:/regex scan of one page. Empty string when nothing found."""
    if not html:
        return ''
    emails = []
    for m in EMAIL_RE.finditer(html):
        cleaned = _clean_email(m.group(0))
        if cleaned:
            emails.append(cleaned)
    if not emails:
        return ''
    # prefer role inboxes on the site's own domain, then any role inbox, then anything
    domain = urlparse(base_url).netloc.lower().removeprefix('www.')
    role = [e for e in emails if e.split('@')[0] in
            ('info', 'contact', 'hello', 'office', 'sales', 'admin', 'mail', 'enquiries', 'support')]
    own = [e for e in role if e.endswith('@' + domain)] or role or emails
    return own[0]


def find_contact_email(home_html, home_url, soup=None):
    """Homepage first, then up to two standard contact pages."""
    email = extract_contact_email(home_html, home_url)
    if email:
        return email
    for path in CONTACT_PATHS[:2]:
        page = scrape_company(urljoin(home_url if home_url.startswith('http') else 'https://' + home_url, path))
        if page['ok']:
            email = extract_contact_email(page['html'], page['final_url'])
            if email:
                return email
    return ''


def _finding(area, severity, weight, issue, recommendation):
    return {'area': area, 'severity': severity, 'weight': weight,
            'issue': issue, 'recommendation': recommendation}


def analyze_website(name, website):
    """Full audit of one company's web presence.

    Returns {has_website, score, contact_email, findings, analysis} where
    score (40–98) is sales potential: more fixable flaws → higher score.
    """
    analysis = {'checked_url': website or '', 'pages_fetched': 0}
    findings = []

    if not website:
        findings.append(_finding(
            'Web presence', 'high', 50,
            f'{name} has no website at all.',
            'Pitch an end-to-end website: domain, landing pages, SEO setup and a booking/contact funnel.'))
        return {'has_website': False, 'score': 95, 'contact_email': '',
                'findings': findings, 'analysis': analysis}

    page = scrape_company(website)
    if not page['ok']:
        # retry with www. before declaring the site dead
        if not website.startswith('www.') and ' ' not in website:
            page = scrape_company('https://www.' + website)
    analysis['checked_url'] = page['final_url']
    if not page['ok']:
        findings.append(_finding(
            'Web presence', 'high', 45,
            f'Website unreachable ({page["error"] or "HTTP %d" % page["status"]}).',
            'Their web presence is broken or missing — pitch a rebuild with reliable hosting.'))
        return {'has_website': False, 'score': 92, 'contact_email': '',
                'findings': findings, 'analysis': analysis}

    analysis['pages_fetched'] = 1
    analysis.update({'http_status': page['status'], 'https': page['https'],
                     'load_ms': page['load_ms'], 'bytes': len(page['html'])})
    soup = BeautifulSoup(page['html'], 'lxml')

    # real brand name from the site itself (og:site_name / title) — fixes
    # garbled SERP titles from the discovery step
    og_site = soup.find('meta', attrs={'property': 'og:site_name'})
    site_name = ((og_site.get('content') or '').strip() if og_site else '') or \
        ((soup.title.string or '').strip() if soup.title and soup.title.string else '')
    site_name = re.split(r'\s*[|–—·]\s*', site_name)[0].strip()
    if 3 <= len(site_name) <= 60:
        analysis['site_name'] = site_name
    score_weight = 0

    if not page['https']:
        score_weight += 12
        findings.append(_finding('Security', 'high', 12, 'Site is not served over HTTPS.',
                                 'Offer an SSL/migration-to-HTTPS upgrade — browsers flag them as “Not secure”.'))

    if page['load_ms'] > 3000:
        score_weight += 8
        findings.append(_finding('Performance', 'medium', 8,
                                 f'Homepage loads slowly ({page["load_ms"] / 1000:.1f}s).',
                                 'Propose a performance audit: image optimisation, caching, CDN.'))

    title = (soup.title.string or '').strip() if soup.title else ''
    if len(title) < 10:
        score_weight += 8
        findings.append(_finding('SEO', 'high', 8, 'Missing or too-short page title.',
                                 'Pitch on-page SEO: unique 50–60 char titles per page.'))
    meta_desc = soup.find('meta', attrs={'name': 'description'})
    if not meta_desc or len((meta_desc.get('content') or '').strip()) < 30:
        score_weight += 6
        findings.append(_finding('SEO', 'medium', 6, 'No usable meta description.',
                                 'Offer to write meta descriptions that lift click-through from search.'))

    if not soup.find('meta', attrs={'name': 'viewport'}):
        score_weight += 10
        findings.append(_finding('Mobile', 'high', 10, 'Not mobile-friendly (no viewport meta).',
                                 'Mobile-first redesign offer — most of their traffic is on phones.'))

    h1s = soup.find_all('h1')
    if len(h1s) == 0 or len(h1s) > 3:
        score_weight += 5
        findings.append(_finding('SEO', 'medium', 5,
                                 f'{len(h1s)} <h1> tags (1 expected).',
                                 'Fix heading hierarchy so search engines read the page correctly.'))

    images = soup.find_all('img')
    if len(images) >= 3:
        missing_alt = sum(1 for img in images if not (img.get('alt') or '').strip())
        if missing_alt / len(images) > 0.5:
            score_weight += 4
            findings.append(_finding('SEO', 'low', 4,
                                     f'{missing_alt}/{len(images)} images have no alt text.',
                                     'Accessibility + image-SEO pass on all media.'))

    text_len = len(soup.get_text(' ', strip=True))
    analysis['text_length'] = text_len
    if text_len < 400:
        score_weight += 6
        findings.append(_finding('Content', 'medium', 6,
                                 f'Thin homepage content (~{text_len} characters).',
                                 'Content marketing package: service pages that rank and convert.'))

    contact_email = find_contact_email(page['html'], page['final_url'], soup)
    analysis['contact_email'] = contact_email
    if not contact_email:
        score_weight += 6
        findings.append(_finding('Contact', 'medium', 6, 'No contact email anywhere obvious.',
                                 'Offer a conversion audit — hard-to-find contact details lose leads.'))

    socials = soup.find_all('a', href=re.compile(r'(facebook|linkedin|instagram|twitter|x)\.com', re.I))
    if not socials:
        score_weight += 3
        findings.append(_finding('Trust', 'low', 3, 'No social links on the homepage.',
                                 'Social proof package: profiles, widgets, review feeds.'))

    if not soup.find('link', rel=lambda v: v and 'icon' in v.lower()):
        score_weight += 2
        findings.append(_finding('Trust', 'low', 2, 'No favicon.',
                                 'Small branding touch: favicon + consistent identity.'))

    score = min(98, 40 + score_weight)
    return {'has_website': True, 'score': score, 'contact_email': contact_email,
            'findings': findings, 'analysis': analysis}
