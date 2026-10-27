"""Free Google Maps scraper — no API key, no Apify bill, no browser.

Port of the technique used by the most-starred open-source Google Maps
scrapers on GitHub (gosom/google-maps-scraper & friends): call the internal
Maps search endpoint directly —

    https://maps.google.com/search?tbm=map&authuser=0&hl=en&q=<query>&pb=<pb>

The `pb` protobuf string pins the map viewport (lat/lon/zoom) used for
ranking; the response is a JSON array (after a `)]}'`-style junk first line)
whose [0][1][i][14] elements are the business records:

    business[11]   name          business[7][0]    website
    business[13]   categories    business[4][7/8]  rating / review count
    business[2]    address parts business[178][0][0] phone
    business[9]    [lat, lon]

Wired into the pipeline for two jobs:

    1. DISCOVERY   — places with no real website are the highest-potential
                     leads for a web-services seller (nothing to audit,
                     everything to build); they enter the CRM with the phone
                     and address straight from the listing.
    2. ENRICHMENT  — profiled leads missing a phone get one from their Maps
                     listing, matched by website domain (never by position).

Everything is best-effort and fail-open: a captcha, a consent wall or a
layout change returns [] and the pipeline carries on with the other sources.
"""

import json
import logging
import re
import time
from urllib.parse import quote

import requests

log = logging.getLogger(__name__)

SEARCH_ENDPOINT = 'https://maps.google.com/search'
FETCH_TIMEOUT = 15
MAPS_HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64. x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
    'Accept-Language': 'en-US,en;q=0.9',
    # bypass the EU consent interstitial that redirects instead of serving results
    'Cookie': 'CONSENT=YES+cb.20240101-01-p0.en+FX+000; SOCS=CAISAiAD',
}

# Viewport/zoom used by the reference scrapers — works reliably.
_PB_TEMPLATE = ('!4m12!1m3!1d3826.902183192154!2d{lon:.4f}!3d{lat:.4f}!2m3!1f0!2f0!3f0'
                '!3m2!1i600!2i800!4f{zoom:.1f}!7i20!8i0'
                '!10b1!12m22!1m3!18b1!30b1!34e1!2m3!5m1!6e2!20e3!4b0!10b1!12b1!13b1!16b1'
                '!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!19m4!2m3!1i360!2i120!4i8')

# Map viewport per place hint — from the discovery query's region part
# ('… in Mumbai, India' → 'mumbai').  zoom 12 ≈ city, 6 ≈ country.
WORLD_FALLBACK = (10.0, 20.0, 3.0)   # (lat, lon, zoom) — query text does the rest
REGION_COORDS = {
    # India priority metros + cities in GLOBAL_CITY_STATE
    'mumbai': (19.0760, 72.8777, 12), 'delhi': (28.6139, 77.2090, 12),
    'bengaluru': (12.9716, 77.5946, 12), 'bangalore': (12.9716, 77.5946, 12),
    'hyderabad': (17.3850, 78.4867, 12), 'chennai': (13.0827, 80.2707, 12),
    'pune': (18.5204, 73.8567, 12), 'ahmedabad': (23.0225, 72.5714, 12),
    'jaipur': (26.9124, 75.7873, 12), 'kolkata': (22.5726, 88.3639, 12),
    'kochi': (9.9312, 76.2673, 12), 'noida': (28.5355, 77.3910, 12),
    'surat': (21.1702, 72.8311, 12), 'nagpur': (21.1458, 79.0882, 12),
    'visakhapatnam': (17.6868, 83.2185, 12), 'indore': (22.7196, 75.8577, 12),
    'lucknow': (26.8467, 80.9462, 12), 'salem': (11.6643, 78.1460, 12),
    'coimbatore': (11.0168, 76.9558, 12), 'madurai': (9.9252, 78.1198, 12),
    'mysuru': (12.2958, 76.6394, 12), 'trichy': (10.7905, 78.7047, 12),
    'erode': (11.3410, 77.7172, 12), 'karachi': (24.8607, 67.0011, 12),
    'dhaka': (23.8103, 90.4125, 12),
    # Salem district + neighbouring Tamil Nadu towns — district/city-level
    # targeting (Settings → Lead Targeting → target cities)
    'omalur': (11.7940, 78.0631, 13), 'mettur': (11.7900, 77.8000, 13),
    'attur': (11.5983, 78.5842, 13), 'sankari': (11.4824, 78.1456, 13),
    'edappadi': (11.5699, 77.8423, 13), 'gangavalli': (11.5519, 78.3760, 13),
    'valapady': (11.6414, 78.5119, 13),
    'namakkal': (11.2189, 78.1674, 12), 'tiruchengode': (11.3798, 77.8977, 13),
    'rasipuram': (11.4700, 78.3925, 13), 'bhavani': (11.4500, 77.6800, 13),
    'komarapalayam': (11.4429, 77.6972, 13),
    # world metros from the REGIONS rotation
    'new york': (40.7128, -74.0060, 12), 'austin': (30.2672, -97.7431, 12),
    'chicago': (41.8781, -87.6298, 12), 'los angeles': (34.0522, -118.2437, 12),
    'san francisco': (37.7749, -122.4194, 12), 'seattle': (47.6062, -122.3321, 12),
    'boston': (42.3601, -71.0589, 12), 'miami': (25.7617, -80.1918, 12),
    'atlanta': (33.7490, -84.3880, 12), 'denver': (39.7392, -104.9903, 12),
    'dallas': (32.7767, -96.7970, 12), 'houston': (29.7604, -95.3698, 12),
    'toronto': (43.6532, -79.3832, 12), 'vancouver': (49.2827, -123.1207, 12),
    'montreal': (45.5019, -73.5674, 12), 'calgary': (51.0447, -114.0719, 12),
    'london': (51.5074, -0.1278, 12), 'manchester': (53.4808, -2.2426, 12),
    'birmingham': (52.4862, -1.8904, 12), 'glasgow': (55.8642, -4.2518, 12),
    'edinburgh': (55.9533, -3.1883, 12), 'dublin': (53.3498, -6.2603, 12),
    'berlin': (52.5200, 13.4050, 12), 'munich': (48.1351, 11.5820, 12),
    'hamburg': (53.5511, 9.9937, 12), 'frankfurt': (50.1109, 8.6821, 12),
    'paris': (48.8566, 2.3522, 12), 'barcelona': (41.3874, 2.1686, 12),
    'madrid': (40.4168, -3.7038, 12), 'amsterdam': (52.3676, 4.9041, 12),
    'brussels': (50.8503, 4.3517, 12), 'zurich': (47.3769, 8.5417, 12),
    'vienna': (48.2082, 16.3738, 12), 'stockholm': (59.3293, 18.0686, 12),
    'copenhagen': (55.6761, 12.5683, 12), 'oslo': (59.9139, 10.7522, 12),
    'helsinki': (60.1699, 24.9384, 12), 'warsaw': (52.2297, 21.0122, 12),
    'prague': (50.0755, 14.4378, 12), 'bucharest': (44.4268, 26.1025, 12),
    'athens': (37.9838, 23.7275, 12), 'istanbul': (41.0082, 28.9784, 12),
    'dubai': (25.2048, 55.2708, 12), 'abu dhabi': (24.4539, 54.3773, 12),
    'riyadh': (24.7136, 46.6753, 12), 'doha': (25.2854, 51.5310, 12),
    'tel aviv': (32.0853, 34.7818, 12), 'tokyo': (35.6762, 139.6503, 12),
    'osaka': (34.6937, 135.5023, 12), 'seoul': (37.5665, 126.9780, 12),
    'beijing': (39.9042, 116.4074, 11), 'shanghai': (31.2304, 121.4737, 12),
    'hong kong': (22.3193, 114.1694, 12), 'jakarta': (-6.2088, 106.8456, 12),
    'kuala lumpur': (3.1390, 101.6869, 12), 'bangkok': (13.7563, 100.5018, 12),
    'ho chi minh': (10.8231, 106.6297, 12), 'manila': (14.5995, 120.9842, 12),
    'singapore': (1.3521, 103.8198, 12), 'sydney': (-33.8688, 151.2093, 12),
    'melbourne': (-37.8136, 144.9631, 12), 'brisbane': (-27.4698, 153.0251, 12),
    'perth': (-31.9505, 115.8605, 12), 'auckland': (-36.8485, 174.7633, 12),
    'sao paulo': (-23.5505, -46.6333, 12), 'rio de janeiro': (-22.9068, -43.1729, 12),
    'buenos aires': (-34.6037, -58.3816, 12), 'santiago': (-33.4489, -70.6693, 12),
    'bogota': (4.7110, -74.0721, 12), 'lima': (-12.0464, -77.0428, 12),
    'mexico city': (19.4326, -99.1332, 12), 'lagos': (6.5244, 3.3792, 12),
    'nairobi': (-1.2921, 36.8219, 12), 'cairo': (30.0444, 31.2357, 12),
    'casablanca': (33.5731, -7.5898, 12), 'accra': (5.6037, -0.1870, 12),
    'cape town': (-33.9249, 18.4241, 12), 'johannesburg': (-26.2041, 28.0473, 12),
    'durban': (-29.8587, 31.0218, 12),
    # country-level fallbacks for the REGIONS rotation (zoom 6)
    'india': (22.3511, 78.6677, 6), 'germany': (51.1657, 10.4515, 6),
    'united kingdom': (54.2361, -2.5, 6), 'united states': (39.8333, -98.5855, 5),
    'canada': (56.1304, -106.3468, 5), 'france': (46.6034, 1.8883, 6),
    'netherlands': (52.2159, 5.0290, 7), 'spain': (40.4637, -3.7492, 6),
    'italy': (41.2925, 12.5736, 6), 'australia': (-25.69, 133.88, 5),
    'uae': (23.4241, 53.8471, 8), 'saudi arabia': (23.8859, 45.0792, 6),
    'south africa': (-28.48, 24.68, 6), 'brazil': (-10.78, -52.92, 5),
    'mexico': (21.16, -101.65, 5), 'japan': (36.56, 139.00, 6),
    'south korea': (36.39, 127.86, 7), 'singapore country': (1.3521, 103.8198, 11),
}

# a Maps "website" that is actually a social page — for our purposes the
# business has NO real website (still a perfect high-potential lead)
SOCIAL_SITE_RE = re.compile(
    r'facebook\.com|instagram\.com|whatsapp\.com|wa\.me|t\.me|linktr\.ee|'
    r'linkedin\.com|x\.com|twitter\.com|youtube\.com|business\.site|carrd\.co|'
    r'linkin\.bio|bio\.link|solo\.to|behance\.net', re.I)

_result_cache = {}          # query → (ts, places)
CACHE_TTL = 6 * 3600       # a query's result set is stable enough for hours


def gmaps_available():
    """This source needs no key — always on (set GMAPS_SCRAPER=0 to disable)."""
    import os
    return os.environ.get('GMAPS_SCRAPER', '1') != '0'


_geo_cache = {}             # place name → (lat, lon) from Nominatim


def _geocode(place):
    """Lat/lon for an arbitrary town via OSM Nominatim (free, keyless).
    Cached for the process lifetime — city coordinates don't change.  Sleeps
    1.1s per MISS to respect Nominatim's 1 req/s policy; None on failure."""
    key = (place or '').strip().lower()
    if not key or key in _geo_cache:
        return _geo_cache.get(key)
    try:
        r = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': place.strip(), 'format': 'json', 'limit': 1},
            headers={**MAPS_HEADERS,
                     'User-Agent': 'agentic-ai-lead-discovery/1.0 (sales agent)'},
            timeout=8)
        data = r.json() if r.status_code == 200 else []
        result = (float(data[0]['lat']), float(data[0]['lon'])) if data else None
    except Exception as exc:
        log.info('gmaps: geocode failed for %r: %s', place, exc)
        result = None
    _geo_cache[key] = result
    time.sleep(1.1)          # Nominatim usage policy — max 1 request/second
    return result


def _viewport_for(query):
    """(lat, lon, zoom) from the query's region part — 'dental clinic in
    Mumbai, India' → Mumbai's viewport.  Resolution order: the built-in city
    table, then a one-time Nominatim geocode (any town a user can type,
    e.g. 'Omalur'), then a world view letting the query text do the work."""
    tail = (query.rsplit(' in ', 1)[-1] if ' in ' in query else query).lower()
    for candidate in (tail, tail.split(',')[0].strip(), tail.split(',')[0].strip() + ' country'):
        if candidate in REGION_COORDS:
            return REGION_COORDS[candidate]
    for key, coords in REGION_COORDS.items():
        if re.search(rf'\b{re.escape(key)}\b', tail):
            return coords
    geo = _geocode(tail)
    if geo:
        return (geo[0], geo[1], 13)   # town-level zoom for geocoded places
    return WORLD_FALLBACK


def _first_str(path_list, *indexes):
    """Best-effort nested string read: _first_str(b, 7, 0) → b[7][0] as str."""
    cur = path_list
    for idx in indexes:
        try:
            cur = cur[idx]
        except (IndexError, TypeError):
            return ''
    return cur if isinstance(cur, str) else ''


def _first_num(path_list, *indexes):
    cur = path_list
    for idx in indexes:
        try:
            cur = cur[idx]
        except (IndexError, TypeError):
            return None
    return cur if isinstance(cur, (int, float)) else None


def _parse_places(body):
    """Parse the tbm=map JSON body into place dicts (gosom layout:
    data[0][1][i] → entry; entry[14] → the business record).  Tolerates the
    anti-hijacking junk line ('while(1);', ')]}'' …) some variants prepend."""
    text = (body or '').lstrip()
    if not text.startswith('['):
        idx = text.find('[')          # payload always starts at the first '['
        if idx == -1:
            raise ValueError('no JSON payload in body')
        text = text[idx:]
    data = json.loads(text)
    container = data[0]
    items = container[1]
    places, seen = [], set()
    for item in items[1:]:
        if not isinstance(item, list):
            continue
        b = item[14] if len(item) > 14 else None
        if not isinstance(b, list):
            continue
        name = _first_str(b, 11) or _first_str(b, 184)   # 184: alt name slot
        if not name or not (2 <= len(name.strip()) <= 80):
            continue
        key = name.strip().lower()
        if key in seen:
            continue
        website = _first_str(b, 7, 0).split('?')[0].split('#')[0]  # drop utm junk
        addr_parts = b[2] if len(b) > 2 and isinstance(b[2], list) else []
        address = ', '.join(str(x) for x in addr_parts
                            if isinstance(x, (str, int, float)))[:200]
        categories = [str(c) for c in (b[13] if len(b) > 13 and isinstance(b[13], list) else [])
                      if isinstance(c, str)]
        places.append({
            'name': name.strip(),
            'phone': _first_str(b, 178, 0, 0).strip(),
            'website': website.strip(),
            'address': address,
            'rating': _first_num(b, 4, 7),
            'reviews': int(_first_num(b, 4, 8) or 0) or None,
            'category': categories[0] if categories else '',
        })
        seen.add(key)
    return places


def gmaps_search(query, limit=10, use_cache=True):
    """Search Google Maps for `query` → list of place dicts.
    Free, keyless, best-effort: [] on any failure."""
    query = (query or '').strip()
    if not query:
        return []
    now = time.time()
    if use_cache and query in _result_cache and now - _result_cache[query][0] < CACHE_TTL:
        return _result_cache[query][1][:limit]

    lat, lon, zoom = _viewport_for(query)
    pb = _PB_TEMPLATE.format(lat=lat, lon=lon, zoom=zoom)
    try:
        resp = requests.get(
            SEARCH_ENDPOINT,
            params={'tbm': 'map', 'authuser': '0', 'hl': 'en', 'q': query, 'pb': pb},
            headers=MAPS_HEADERS, timeout=FETCH_TIMEOUT, allow_redirects=True)
    except requests.RequestException as exc:
        log.info('gmaps: fetch failed for %r: %s', query, exc)
        return []
    if resp.status_code != 200:
        log.info('gmaps: HTTP %s for %r', resp.status_code, query)
        return []
    body = resp.text or ''
    # the payload starts with a throwaway anti-hijacking first line — cut it
    if '\n' in body[:200]:
        body = body.split('\n', 1)[1]
    try:
        places = _parse_places(body)
    except (ValueError, IndexError, TypeError) as exc:
        log.info('gmaps: parse failed for %r: %s (layout change?)', query, exc)
        return []
    places = places[:limit]
    _result_cache[query] = (now, places)
    return places


# --- pipeline integration -----------------------------------------------------

def has_real_website(place):
    """False when the Maps listing has no website at all or only a social
    page — for a web-services seller this is the dream lead."""
    url = (place.get('website') or '').strip()
    return bool(url) and not SOCIAL_SITE_RE.search(url)


def _norm(domain):
    d = (domain or '').strip().lower()
    for prefix in ('https://', 'http://'):
        if d.startswith(prefix):
            d = d[len(prefix):]
    d = d.split('/', 1)[0]
    return d[4:] if d.startswith('www.') else d


def discover_no_website_places(query, limit=3):
    """Places from a Maps search that have NO real website — new-website
    leads with phone + address from the listing itself."""
    return [p for p in gmaps_search(query, limit=limit * 5)
            if not has_real_website(p) and p.get('phone')][:limit]


_NAME_STOPWORDS = {'pvt', 'pvt.', 'ltd', 'ltd.', 'llp', 'private', 'limited',
                   'the', 'and', 'co', 'co.', 'company', 'inc', 'india'}


def _name_matches(lead_name, place_name):
    """Token-overlap name match — Maps titles differ from site titles
    ('Yours Perfect Eventz Management' vs 'Yours Perfect Eventz - Salem').
    True when ≥70% of the lead's significant tokens appear in the place name
    (or an exact match, checked by the caller first)."""
    a = {t for t in re.findall(r'\w+', (lead_name or '').lower()) if t not in _NAME_STOPWORDS}
    b = {t for t in re.findall(r'\w+', (place_name or '').lower()) if t not in _NAME_STOPWORDS}
    if not a or not b:
        return False
    return len(a & b) / len(a) >= 0.7


def enrich_leads_via_gmaps(leads, delay=2.5):
    """Fill empty lead phones from Google Maps listings.  A lead matches a
    place by normalized website domain, else by exact lowercased name, else by
    token-overlap name match (≥70% of tokens).  Only EMPTY phone fields are
    filled; every match records its source in analysis.phone_source.
    Returns the leads that got a number."""
    enriched = []
    for lead in leads:
        region = ' '.join(filter(None, [getattr(lead, 'state', ''), getattr(lead, 'country', '')]))
        query = f'{lead.company} {region}'.strip()
        try:
            places = gmaps_search(query, limit=5)
        except Exception as exc:          # never let one query kill the sweep
            log.info('gmaps: search crashed for %r: %s', query, exc)
            continue
        domain = _norm(getattr(lead, 'website', ''))

        def _conflicts(p):
            # a listing with its OWN, different website is another business
            other = _norm(p.get('website', ''))
            return bool(domain and other and other != domain)

        match = None
        for p in places:
            if domain and _norm(p.get('website', '')) == domain:
                match = p
                break
        if match is None:
            lname = (lead.company or '').strip().lower()
            for p in places:
                if p.get('phone') and not _conflicts(p) and p['name'].strip().lower() == lname:
                    match = p
                    break
        if match is None:
            for p in places:
                if p.get('phone') and not _conflicts(p) and _name_matches(lead.company, p['name']):
                    match = p
                    break
        if match and match.get('phone'):
            lead.contact_phone = match['phone']
            analysis = dict(getattr(lead, 'analysis', None) or {})
            analysis['phone_source'] = 'google-maps'
            if match.get('address'):
                analysis['gmaps_address'] = match['address']
            if match.get('rating') is not None:
                analysis['gmaps_rating'] = match['rating']
                analysis['gmaps_reviews'] = match.get('reviews')
            lead.analysis = analysis
            lead.save()
            enriched.append(lead)
        if delay:
            time.sleep(delay)   # politeness — we are a scraper, not a DDoS
    return enriched
