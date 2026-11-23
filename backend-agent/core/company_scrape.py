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

Signed-in owner/admin only (IsAuthenticatedOrReadOnly + the settings
permission is not re-checked here; the data returned is the caller's own
site) and rate-limited per IP by CompanyScrapeThrottle (10/min).  The
richer model reading — what the site sells, who buys — is the second step,
core.company_infer.
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


def fetch_public(url, budget=None):
    """GET with hand-followed redirects; every hop is SSRF-checked BEFORE
    the connection.  Returns the final non-redirect response.  `budget`
    (seconds) shrinks the DEADLINE for callers that have several pages to
    try inside one request."""
    deadline = time.monotonic() + (DEADLINE if budget is None else budget)
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


ADDRESS_WORDS = re.compile(
    r'\b(street|st\.|road|rd\.|avenue|ave\.|nagar|colony|sector|'
    r'layout|cross|main road|highway|hwy|lane|ln\.|court|ct\.|drive|'
    r'plaza|complex|building|tower|block|floor|suite|unit|'
    r'pin|pincode|zip|postal|salai|vihar|puram|district|taluk)\b', re.I)


CONTACT_PATHS = ('/contact', '/contact-us', '/contactus', '/about',
                 '/about-us', '/aboutus', '/contact.html', '/reach-us')
CONTACT_BUDGET = 8          # seconds for the whole contact-page search
CONTACT_FETCH = 3           # seconds per contact page — a missing page must not stall
CONTACT_MAX_MISSES = 4      # give up after this many pages in a row with no address


def _scrape_address_from_contact_pages(base_url):
    """Many businesses put their address on /about or /contact instead of the
    homepage. Try each common path in turn — within one time budget, and
    giving up after a few pages in a row that hold no address."""
    deadline = time.monotonic() + CONTACT_BUDGET
    misses = 0
    for path in CONTACT_PATHS:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or misses >= CONTACT_MAX_MISSES:
            break
        try:
            resp = fetch_public(base_url.rstrip('/') + path,
                                budget=min(CONTACT_FETCH, remaining))
            if resp.status_code != 200:
                misses += 1
                continue
            soup = BeautifulSoup(resp.text[:MAX_HTML], 'lxml')
            addr = _jsonld_address(soup) or address_in_text(soup)
        except Exception:          # a dead path is simply not the address page
            misses += 1
            continue
        if addr and len(addr) > 5:
            return addr[:300]
        misses += 1
    return ''


# "ChÃ­a" — UTF-8 read as Latin-1: whatever the field is, it is not usable
GARBLED_RE = re.compile(r'[\u00c2\u00c3][\u0080-\u00bf]')


def _jsonld_addresses(soup):
    """[(has_street, address)] from schema.org JSON-LD (PostalAddress /
    address), in page order.  Garbled entries are skipped."""
    import json as _json
    found = []
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
                parts = [str(addr.get(k, '') or '').strip() for k in
                         ('streetAddress', 'addressLocality', 'addressRegion',
                          'postalCode', 'addressCountry')]
                joined = ', '.join(p for p in parts if p)
                if len(joined) > 5 and not GARBLED_RE.search(joined):
                    found.append((bool(str(addr.get('streetAddress') or '').strip()), joined[:300]))
            elif isinstance(addr, list):
                for one in addr:
                    if isinstance(one, str) and len(one.strip()) > 5 and not GARBLED_RE.search(one):
                        found.append((True, one.strip()[:300]))
            elif isinstance(addr, str) and len(addr.strip()) > 5 and not GARBLED_RE.search(addr):
                found.append((True, addr.strip()[:300]))
    return found


def _jsonld_address(soup):
    """The best schema.org address: a full street address beats a town-only
    entry."""
    found = _jsonld_addresses(soup)
    return (next((a for has_street, a in found if has_street), '')
            or next((a for has_street, a in found if not has_street), ''))


ADDRESS_LABEL_RE = re.compile(
    r'(?:postal\s+|mailing\s+|registered\s+|corporate\s+|office\s+|business\s+)?address\s*[:]?\s*', re.I)
# what typically FOLLOWS an address on a line: "Address: 12 Road, Pune Phone: +91 …"
NEXT_LABEL_RE = re.compile(
    r'\b(?:phone|tel|telephone|mobile|whatsapp|email|e-mail|mail|website|web\b|fax|'
    r'gstin|cin\b|copyright|©|all rights reserved|follow us|quick links)\b', re.I)
# a PIN / ZIP code (4-6 digits — but not a year)
ADDRESS_CODE_RE = re.compile(r'(?<![\d.])(?:(?!19\d\d|20\d\d)\d{4}|\d{5,6})(?![\d.])')
# phone / mail lines carry numbers too — never an address
CONTACT_LINE_RE = re.compile(
    r'\b(?:call|phone|telephone|mobile|whatsapp|dial|fax|email|e-mail|skype|toll[- ]free)\b|[@+]\d', re.I)
ADDRESS_LEAD_RE = re.compile(
    r'^(?:we are (?:located|based )?(?:at|in)|located (?:at|in)|based (?:at|in)|address(?: is)?|'
    r'visit us (?:at|in)|our address is|find us (?:at|in))\s*:?\s*', re.I)
COPYRIGHT_LEAD_RE = re.compile(r'^(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[–-]?\s*)?', re.I)
SEGMENT_SPLIT_RE = re.compile(r'\s*[·•|]\s*')     # footer bullets: "Acme · 12 MG Road · Privacy"


def tidy_address(text):
    """Drop the words that may lead or trail an address
    ('We are located at …', '© 2024 …', a trailing full stop)."""
    return COPYRIGHT_LEAD_RE.sub('', ADDRESS_LEAD_RE.sub('', text)).strip(' ,;:.·•|')


def looks_like_address(line):
    """'158, E Block, TNHB, …, Salem, Tamil Nadu, India' — most sites print
    their address with no PIN code, so a street number or a list of places
    counts too.  Kept strict on purpose: this line is printed under every
    cold email, so a wrong address is worse than none."""
    line = tidy_address(line)
    if not 10 <= len(line) <= 200 or GARBLED_RE.search(line) or CONTACT_LINE_RE.search(line):
        return False
    has_code = bool(ADDRESS_CODE_RE.search(line))
    if has_code and ',' in line:                  # "490 Anna Salai, Chennai 600002, Tamil Nadu"
        return True
    words = {word.lower() for word in ADDRESS_WORDS.findall(line)}
    if not words:
        return False
    if has_code:
        return True
    # no number at all: a short list of places naming two address words —
    # never a sentence ("… layout, flexbox, grid and responsive design")
    starts_with_number = bool(re.match(r'^\d{1,5}\b', line))
    return (starts_with_number or (len(words) >= 2 and len(line) <= 120)) and line.count(',') >= 3


# one address is often one paragraph broken with <br>: those lines belong together
BLOCK_TAGS = ['p', 'li', 'td', 'th', 'address', 'dd', 'dt', 'blockquote', 'figcaption',
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'caption', 'label', 'button']


def text_lines(page):
    """[(block, line)] — the visible text of a page (html or a soup) as
    cleaned lines, each with the block element it belongs to. The line breaks
    a visitor sees separate an address from its label, while a `<br>` inside
    one paragraph makes several lines of ONE address."""
    soup = BeautifulSoup(page, 'lxml') if isinstance(page, str) else page
    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()
    root = soup.body if soup.body is not None else soup
    lines = []
    for node in root.find_all(string=True):
        block = node.find_parent(BLOCK_TAGS)
        if block is None:
            block = node
        for piece in str(node).split('\n'):
            piece = re.sub(r'\s+', ' ', piece).strip(' \t•|,;')
            if piece:
                lines.append((id(block), piece))
    return lines


def address_in_text(page):
    """The postal address a page prints, or ''. Read block by block: an
    'Address' label (with the address under it or after it), then the footer
    / contact block. Never one whole paragraph — a page read as a single
    line is never an address."""
    lines = text_lines(page)
    blocks = {}
    for block, line in lines:
        blocks.setdefault(block, []).append(line)
    whole = [', '.join(parts) for parts in blocks.values()]      # the page, one text per block

    # 1. 'Address' on its own line, the address in the block under it
    for i, (_, label) in enumerate(lines[:-1]):
        if ADDRESS_LABEL_RE.fullmatch(label):
            following = ', '.join(blocks[lines[i + 1][0]])
            if looks_like_address(following):
                return tidy_address(following)
    # 2. 'Address: 12 Workshop Road, Pune  Phone: …' — up to the next label
    for text in whole:
        label = ADDRESS_LABEL_RE.search(text)
        if not label or label.end() == len(text):
            continue
        rest = text[label.end():]
        cut = NEXT_LABEL_RE.search(rest)
        candidate = (rest[:cut.start()] if cut else rest).strip(' ,;')
        if looks_like_address(candidate):
            return tidy_address(candidate)
    # 3. no label: an address-shaped block (the footer is the usual place, so
    #    read from the bottom) — or one bullet of a shared footer line
    for text in reversed(whole):
        candidates = SEGMENT_SPLIT_RE.split(text) if SEGMENT_SPLIT_RE.search(text) else [text]
        for candidate in candidates:
            if looks_like_address(candidate):
                return tidy_address(candidate)
    return ''


def visible_text(html, body_only=False):
    """Whitespace-normalised text a visitor can read. body_only=True also
    drops the nav/footer/header chrome — menus are not 'what you do'."""
    soup = BeautifulSoup(html or '', 'lxml')
    drop = ['script', 'style', 'noscript'] + (['nav', 'footer', 'header'] if body_only else [])
    for tag in soup(drop):
        tag.decompose()
    root = soup.body if soup.body is not None else soup
    return re.sub(r'\s+', ' ', root.get_text(' ', strip=True))


def company_details(html, final_url):
    """Fast, model-free page facts: {name, description, services, address}.

    brand from og:site_name/title (pick_site_name cleans junk), registrable-
    domain name as the fallback; description from the meta description when
    meaningful, else the first excerpt of the page BODY; services only from
    explicit schema.org offers (page headings are marketing lines, not a
    list of what is sold — the model reads the page for that). The address
    is a schema.org street address, else one the page prints (footer,
    'Address:' label, /about), else a schema.org town-only entry. The richer
    model reading (what it sells, who buys) lives in core.business_profile."""
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
    if len(description) < 40:  # absent or too thin to be meaningful
        description = visible_text(html, body_only=True)[:MAX_DESCRIPTION].strip()

    services = _jsonld_services(soup)

    structured = _jsonld_addresses(soup)
    with_street = [a for has_street, a in structured if has_street]
    town_only = [a for has_street, a in structured if not has_street]
    address = next((a for a in [*with_street, address_in_text(soup), *town_only] if a), '')
    if not address:
        # many businesses put their address on /about or /contact instead
        try:
            address = _scrape_address_from_contact_pages(final_url)
        except Exception:
            pass

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
