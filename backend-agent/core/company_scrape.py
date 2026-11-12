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

Token auth, no paywall: self-serve signups use this while their
subscription is still PENDING, and the user-initiated single fetch of
their OWN site is not agent traffic (robots.txt politeness applies to
the pipeline's discovery crawls, not to this).
"""

import ipaddress
import re
import socket
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .scraper import MAX_HTML, USER_AGENT, _registrable, name_from_domain, pick_site_name

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


def company_details(html, final_url):
    """{name, description} from one homepage: brand from og:site_name/title
    (pick_site_name cleans 'Home | …' style junk), registrable-domain name
    as the fallback; description from the meta description when it is
    meaningful, else the first excerpt of visible text (≤300 chars)."""
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
        for tag in soup(['script', 'style', 'noscript']):
            tag.decompose()
        root = soup.body if soup.body is not None else soup  # title lives in <head>
        text = re.sub(r'\s+', ' ', root.get_text(' ', strip=True))
        description = text[:MAX_DESCRIPTION].strip()
    return {'name': name, 'description': description[:MAX_DESCRIPTION]}


@api_view(['POST'])
@permission_classes([IsAuthenticated])  # own permission_classes → no global paywall
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
