"""POST /api/company/scrape — signup's "Fetch details" helper.

The user pastes their own website; we fetch the homepage once and hand
back the brand name + a one-line description so signup can prefill the
company profile (Settings → Your business reads the same fields).

Fetching is SSRF-guarded: the URL's host — and every redirect hop — must
resolve to a PUBLIC address before we connect.  Redirects are followed by
hand (requests allow_redirects=False) precisely so no hop can slip past
the guard.  Name/description extraction reuses the Search agent's
scraper helpers (pick_site_name, name_from_domain); only the guarded
fetch lives here.

Open to anonymous visitors — the "Fetch details" button sits on the
signup form, where no token exists yet — and rate-limited per IP by
CompanyScrapeThrottle (10/min) instead.  No paywall: the user-initiated
single fetch of their OWN site is not agent traffic (robots.txt
politeness applies to the pipeline's discovery crawls, not to this).
"""

import ipaddress
import re
import socket
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .scraper import MAX_HTML, USER_AGENT, _registrable, name_from_domain, pick_site_name
from .throttles import CompanyScrapeThrottle

FETCH_TIMEOUT = 6   # seconds per request
DEADLINE = 10       # seconds for the whole fetch (brief: ≤10s)
MAX_HOPS = 4
MAX_DESCRIPTION = 300


class BadUrl(Exception):
    """The URL cannot be fetched safely — always reported as 422, never a 500."""


def _is_private_address(text):
    """Loopback / private / link-local / reserved / multicast / unspecified."""
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return True  # not an IP at all — callers only pass parsed addresses
    return (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified)


def _require_public_host(host):
    """Reject literal private IPs and hostnames that resolve (wholly or
    partly) into private/loopback space — the basic SSRF guard."""
    if not host:
        raise BadUrl('Enter a valid website URL.')
    literal = host.strip('[]')
    try:
        ipaddress.ip_address(literal)
    except ValueError:
        pass
    else:
        if _is_private_address(literal):
            raise BadUrl('That address is not allowed.')
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise BadUrl("We couldn't find that website. Check the address.")
    for info in infos:
        if _is_private_address(info[4][0]):
            raise BadUrl('That address is not allowed.')


def normalize_url(url):
    url = (url or '').strip()
    if not url:
        raise BadUrl('Enter the website address.')
    if '://' in url and not re.match(r'^https?://', url, re.I):
        raise BadUrl('Enter a valid website URL (http or https).')
    if not re.match(r'^https?://', url, re.I):
        url = 'https://' + url
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname:
        raise BadUrl('Enter a valid website URL.')
    return url


def fetch_public(url):
    """GET with hand-followed redirects; every hop is SSRF-checked BEFORE
    the connection.  Returns the final non-redirect response."""
    deadline = time.monotonic() + DEADLINE
    for _hop in range(MAX_HOPS):
        _require_public_host(urlparse(url).hostname)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise BadUrl('That website took too long to answer.')
        try:
            resp = requests.get(
                url,
                headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en;q=0.9,*;q=0.5'},
                timeout=min(FETCH_TIMEOUT, remaining),
                allow_redirects=False,
            )
        except requests.RequestException:
            raise BadUrl("We couldn't reach that website. Check the address.")
        if resp.status_code in (301, 302, 303, 307, 308):
            location = (resp.headers.get('Location') or '').strip()
            if not location:
                raise BadUrl('That website sent us in a loop.')
            url = urljoin(url, location)
            continue
        return resp
    raise BadUrl('That website redirected us too many times.')


def _jsonld_services(soup):
    """services from schema.org JSON-LD (Organization, LocalBusiness,
    ProfessionalService...) — knowsAbout, makesOffer."""
    services = []
    import json as _json
    for tag in soup.find_all('script', attrs={'type': 'application/ld+json'}):
        try:
            data = _json.loads(tag.string or '')
        except Exception:
            continue
        for node in (data if isinstance(data, list) else [data]):
            if not isinstance(node, dict):
                continue
            types = ' '.join(str(t).lower() for t in
                             (node.get('@type') if isinstance(node.get('@type'), list)
                              else [node.get('@type') or '']))
            if not any(k in types for k in ('organization', 'business', 'service', 'store')):
                continue
            for ka in (node.get('knowsAbout') or []):
                if isinstance(ka, str) and 2 < len(ka) < 60:
                    services.append(ka.strip())
            for offer in (node.get('makesOffer') or []):
                item = offer.get('itemOffered') if isinstance(offer, dict) else None
                label = (item or {}).get('name') if isinstance(item, dict) else None
                if label and 2 < len(label) < 60:
                    services.append(label.strip())
    return services


SERVICE_WORDS = re.compile(
    r'\b(consulting|development|design|marketing|accounting|legal|repair|'
    r'installation|maintenance|training|coaching|outsourcing|hosting|'
    r'support|staffing|recruitment|manufacturing|logistics|printing|'
    r'photography|catering|cleaning|plumbing|electrical|landscaping|'
    r'real estate|insurance|healthcare|dental|clinic|education|'
    r'e-?commerce|saas|software|web|cloud|seo|crm|erp|automation|'
    r'services|solutions|platform|studio|agency|therapy|wellness|'
    r'gym|fitness|salon|spa|restaurant|cafe|bakery|hotel|travel|'
    r'tours|rental|dealer|shop|store|boutique|farm|dairy|organic|'
    r'construction|builder|interior|architecture|engineering|'
    r'audit|tax|advisory|investment|loans|banking|trading|export|'
    r'distribution|supply|freight|transport|delivery|courier|'
    r'publishing|media|advertising|branding|content|video|film|'
    r'animation|gaming|iot|ai|ml|data|analytics|cyber|security|'
    r'networking|telecom|mobile|app|game|wordpress|shopify|'
    r'immigration|visa|advocates|law|chartered|company secretary)\b', re.I)

ADDRESS_WORDS = re.compile(
    r'\b(street|st\.|road|rd\.|avenue|ave\.|nagar|colony|sector|'
    r'layout|cross|main road|highway|hwy|lane|ln\.|court|ct\.|drive|'
    r'plaza|complex|building|tower|block|floor|suite|unit|'
    r'pin|pincode|zip|postal)\b', re.I)


def _jsonld_address(soup):
    """street address from schema.org JSON-LD (PostalAddress / address)."""
    import json as _json
    for tag in soup.find_all('script', attrs={'type': 'application/ld+json'}):
        try:
            data = _json.loads(tag.string or '')
        except Exception:
            continue
        for node in (data if isinstance(data, list) else [data]):
            if not isinstance(node, dict):
                continue
            addr = node.get('address')
            if isinstance(addr, dict):
                parts = [str(addr.get(k, '')).strip() for k in
                         ('streetAddress', 'addressLocality', 'addressRegion',
                          'postalCode', 'addressCountry')]
                joined = ', '.join(p for p in parts if p)
                if len(joined) > 5:
                    return joined[:300]
            if isinstance(addr, str) and len(addr.strip()) > 5:
                return addr.strip()[:300]
    return ''


def _footer_address(visible_text):
    """an address-looking line from the page text — the footer area is the
    most common place businesses put it."""
    tail = visible_text[-1500:] if len(visible_text) > 1500 else visible_text
    for line in re.split(r'[\n\u2022|]', tail):
        line = line.strip(' ,;-–—')
        if 10 < len(line) < 200 and ADDRESS_WORDS.search(line):
            # must also contain a digit (street no. or pincode) to cut noise
            if re.search(r'\d{4,6}\b', line) or re.search(r'\b\d+[-\s]', line):
                return line[:300]
    return ''


def _heading_services(soup, cap=6):
    """short h2/h3 phrases that read like service lines."""
    out = []
    for h in soup.find_all(['h2', 'h3']):
        text = re.sub(r'\s+', ' ', h.get_text(' ', strip=True))
        if 3 < len(text) < 60 and SERVICE_WORDS.search(text):
            out.append(text)
        if len(out) >= cap:
            break
    return out


def company_details(html, final_url):
    """{name, description, services} from one homepage: brand from
    og:site_name/title (pick_site_name cleans junk), registrable-domain
    name as the fallback; description from meta description when
    meaningful, else the first visible excerpt; services distilled from
    JSON-LD, service-y headings, and (when the local AI is up) a qwen
    summary of the page text."""
    soup = BeautifulSoup(html or '', 'lxml')

    og_site = soup.find('meta', attrs={'property': 'og:site_name'})
    raw_name = ((og_site.get('content') or '').strip() if og_site else '') or \
        ((soup.title.string or '').strip() if soup.title and soup.title.string else '')
    name = pick_site_name(raw_name)
    if not name:
        domain = urlparse(final_url).netloc.split(':')[0].lower()
        domain = domain[4:] if domain.startswith('www.') else domain
        name = name_from_domain(_registrable(domain))

    meta_desc = soup.find('meta', attrs={'name': 'description'})
    description = (meta_desc.get('content') or '').strip() if meta_desc else ''

    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()
    root = soup.body if soup.body is not None else soup
    visible = re.sub(r'\s+', ' ', root.get_text(' ', strip=True))
    if len(description) < 40:
        description = visible[:MAX_DESCRIPTION].strip()

    services = _jsonld_services(soup)
    if not services:
        services = _heading_services(soup)
    if len(services) < 2:
        from .ai import llm_available, llm_complete
        try:
            ai_up = llm_available()
        except Exception:
            ai_up = False   # no workspace context (shell/tests) — skip AI
        if ai_up:
            try:
                out = llm_complete(
                    'From this homepage text, list exactly what the company sells/does '
                    'as 2-5 short service phrases separated by commas (max 5 words each). '
                    'Reply with ONLY the comma list, nothing else.\n\n'
                    + visible[:2500],
                    system='You extract service lists. Reply with only a comma-separated list.',
                    temperature=0, timeout=8)
                if out and len(out) < 300 and '\n' not in out:
                    services = [s.strip(' .') for s in out.split(',') if 2 < len(s.strip()) < 60]
            except Exception:
                pass  # AI down or slow — the JSON-LD/heading list stands

    address = _jsonld_address(soup)
    if not address:
        address = _footer_address(visible)

    return {'name': name,
            'description': description[:MAX_DESCRIPTION],
            'services': services[:6],
            'address': address}


@api_view(['POST'])
@permission_classes([IsAuthenticatedOrReadOnly])  # owner lockdown: anonymous scraping disabled
# (POST needs a login; the SSRF guard + per-IP throttle remain for abuse inside accounts)
@throttle_classes([CompanyScrapeThrottle])
def company_scrape(request):
    data = request.data if hasattr(request.data, 'get') else {}
    raw = data.get('url')
    try:
        url = normalize_url(raw if isinstance(raw, str) else '')
        resp = fetch_public(url)
    except BadUrl as exc:
        return Response({'detail': str(exc)}, status=422)
    if resp.status_code != 200:
        return Response({'detail': f'That website answered HTTP {resp.status_code}.'}, status=422)
    return Response(company_details(resp.text[:MAX_HTML], resp.url))
