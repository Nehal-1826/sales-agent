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
    # Google product microsites & properties that are NOT google.com subdomains
    # (stitch.withgoogle.com, developers.googleblog.com, …) — they used to
    # slip through the blocklist and show up as fake "companies"
    'withgoogle.com', 'googleblog.com', 'googleusercontent.com', 'gstatic.com',
    'googleapis.com', 'googlesource.com', 'doubleclick.net', 'googletagmanager.com',
    'googleadservices.com', 'googlesyndication.com', 'appspot.com', 'firebaseapp.com',
    'firebaseio.com', 'web.app', 'blogspot.com', 'blogs.google.com', 'deepmind.com',
    'waymo.com', 'alphabet.com', 'abc.xyz',
    # free hosting / dev-deploy subdomains — platform pages, not company sites
    'vercel.app', 'netlify.app', 'pages.dev', 'github.io', 'gitlab.io',
    'herokuapp.com', 'onrender.com', 'fly.dev', 'railway.app', 'replit.dev',
    'glitch.me', 'stackblitz.io', 'codepen.io', 'replit.com',
    # link-in-bio / one-page builders and free subdomain hosts
    'linktr.ee', 'beacons.ai', 'carrd.co', 'notion.site', 'substack.com',
    'hashnode.dev', 'dev.to', 'weebly.com', 'yolasite.com', 'jimdofree.com',
    'mystrikingly.com', 'godaddysites.com', 'business.site', 'webnode.com',
    # messaging / comms platforms that surface in agency & SaaS SERPs
    'whatsapp.com', 'telegram.org', 'signal.org', 'discord.com', 'slack.com',
    'zoom.us', 'teams.microsoft.com', 'wechat.com', 'qq.com', 'line.me',
    'kakao.com', 'naver.com', 'baidu.com', 'yandex.com', 'yandex.ru', 'mail.ru',
    # link shorteners & chat deep links — never a company homepage
    # (a 'wa.me/<number>' SERP hit once became a fake lead with "no website")
    'wa.me', 't.me', 'telegram.me', 'm.me', 'messenger.com', 'bit.ly',
    'tinyurl.com', 'is.gd', 'cutt.ly', 'rebrand.ly', 'tiny.cc', 'shorte.st',
    'ow.ly', 'buff.ly', 'shorturl.at', 's.id', 'lnkd.in', 'forms.gle',
    'calendly.com', 'heylink.me', 'solo.to', 'bio.link', 'taplink.cc',
    # AI / productivity platforms — not prospects
    'openai.com', 'chatgpt.com', 'anthropic.com', 'claude.ai', 'deepseek.com',
    'perplexity.ai', 'x.ai', 'grok.com', 'mistral.ai', 'meta.com', 'threads.net',
    'notion.so', 'canva.com', 'figma.com', 'webflow.com', 'miro.com',
    # agencies-of-aggregators: lead directories dressed as agencies
    'sortlist.com', 'toptal.com', 'topagency.com', 'upcity.com', 'promotify.com',
    # portfolio / creative communities — not company homepages
    'behance.net', 'dribbble.com', 'artstation.com', 'deviantart.com',
    # freelance marketplaces
    'freelancer.com', 'peopleperhour.com', 'thumbtack.com', 'guru.com',
    # SEO / ranking directories
    '10seos.com', 'goodfirms.co', 'topseos.com', 'themanifest.com',
    'semrush.com', 'ahrefs.com', 'moz.com', 'similarweb.com',
    'awwwards.com', 'cssdesignawards.com', 'siteinspire.com', 'land-book.com',
    'lapa.ninja', 'godly.website', 'dark.mode', 'onepagelove.com',
    # traffic-stats / WHOIS / domain-info directories (their subdomains wrap
    # real companies' names — e.g. designagency.gr.siteindices.com)
    'siteindices.com', 'webwiki.com', 'whois.com', 'who.is', 'builtwith.com',
    'w3snoop.com', 'statscrop.com', 'webstatsdomain.com', 'pagestat.com',
    'siteworthtraffic.com', 'urlmetrix.com', 'webtraffic24.com',
    # standards bodies / consortia — organizations, never prospects
    'w3.org', 'whatwg.org', 'ietf.org', 'iso.org', 'ansi.org', 'khronos.org',
    'oasis-open.org', 'ecma-international.org', 'ietf.org',
    # reference / documentation sites that answer "what is X" queries
    'web.dev', 'developer.mozilla.org', 'mozilla.org', 'stackoverflow.com',
    'merriam-webster.com', 'dictionary.com', 'cambridge.org', 'wiktionary.org',
    'vocabulary.com', 'investopedia.com', 'w3schools.com', 'geeksforgeeks.org',
    'techtarget.com', 'browsehub.co', 'thoughtco.com', 'livescience.com',
    # AI site/presentation builders
    'gamma.app', 'tome.app', 'beautiful.ai', 'framer.com', 'wixstudio.com',
    # hosting / infra
    'godaddy.com', 'namecheap.com', 'hostinger.com', 'cloudflare.com', 'dynadot.com',
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
    # booking / review directories that answer "X near me" queries
    'whatclinic.com', 'practo.com', 'healthgrades.com', 'zocdoc.com',
    'booksy.com', 'fresha.com', 'opentable.com', 'classpass.com',
    'mindbodyonline.com', 'threebestrated.com', 'threebestrated.ca',
    'threebestrated.co.uk', 'threebestrated.in', 'atlaq.com',
    'indiamart.com', 'sulekha.com', 'tradeindia.com', 'exportersindia.com',
    'appointy.com', 'vcita.com', 'simplybook.it', 'setmore.com',
    # giant enterprises — never prospects
    'salesforce.com', 'hubspot.com', 'adobe.com', 'ibm.com', 'oracle.com', 'sap.com',
    'deloitte.com', 'pwc.com', 'ey.com', 'kpmg.com', 'accenture.com', 'mckinsey.com',
    'bcg.com', 'bain.com', 'siemens.com', 'bosch.com', 'telekom.com',
    'walmart.com', 'target.com', 'ikea.com', 'zara.com', 'hm.com',
    'zalando.com', 'aboutyou.com', 'otto.de', 'aldi.com', 'lidl.com', 'rewe.de',
}

# Worldwide rotation — 120 countries across all six inhabited continents,
# plus flagship metros (metro queries give state/region granularity via
# GLOBAL_CITY_STATE below).  One slice per cycle-step, n regions per cycle.
REGIONS = [
    # Europe (38)
    'Germany', 'United Kingdom', 'France', 'Netherlands', 'Spain', 'Italy',
    'Ireland', 'Portugal', 'Belgium', 'Switzerland', 'Austria', 'Sweden',
    'Norway', 'Denmark', 'Finland', 'Iceland', 'Poland', 'Czech Republic',
    'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Greece', 'Croatia',
    'Slovenia', 'Serbia', 'Ukraine', 'Estonia', 'Latvia', 'Lithuania',
    'Luxembourg', 'Malta', 'Cyprus', 'Albania', 'North Macedonia',
    'Bosnia and Herzegovina', 'Moldova', 'Montenegro',
    # North America (13)
    'United States', 'Canada', 'Mexico', 'Costa Rica', 'Panama', 'Guatemala',
    'Honduras', 'El Salvador', 'Nicaragua', 'Dominican Republic', 'Jamaica',
    'Trinidad and Tobago', 'Puerto Rico',
    # South America (10)
    'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Uruguay',
    'Paraguay', 'Bolivia', 'Venezuela',
    # Asia (30)
    'India', 'China', 'Japan', 'South Korea', 'Taiwan', 'Hong Kong',
    'Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines',
    'Indonesia', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Cambodia',
    'Myanmar', 'Mongolia', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan',
    'Israel', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
    'Jordan', 'Lebanon', 'Turkey',
    # Africa (24)
    'South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco', 'Ghana',
    'Tanzania', 'Uganda', 'Ethiopia', 'Rwanda', 'Zambia', 'Zimbabwe',
    'Botswana', 'Namibia', 'Mozambique', 'Senegal', 'Ivory Coast',
    'Cameroon', 'Tunisia', 'Algeria', 'Mauritius', 'Angola', 'Malawi',
    'Libya',
    # Oceania (4)
    'Australia', 'New Zealand', 'Fiji', 'Papua New Guinea',
    # Metro queries — state/region-level leads in the biggest markets
    # (every city here is in GLOBAL_CITY_STATE so the lead gets its state).
    'New York, USA', 'Austin, USA', 'Chicago, USA', 'Los Angeles, USA',
    'San Francisco, USA', 'London, UK', 'Manchester, UK', 'Toronto, Canada',
    'Mexico City, Mexico', 'Sao Paulo, Brazil', 'Buenos Aires, Argentina',
    'Santiago, Chile', 'Lima, Peru', 'Bogota, Colombia',
    'Berlin, Germany', 'Munich, Germany', 'Paris, France', 'Barcelona, Spain',
    'Milan, Italy', 'Amsterdam, Netherlands', 'Brussels, Belgium',
    'Zurich, Switzerland', 'Vienna, Austria', 'Stockholm, Sweden',
    'Warsaw, Poland', 'Istanbul, Turkey', 'Mumbai, India', 'Dubai, UAE',
    'Riyadh, Saudi Arabia', 'Doha, Qatar', 'Tokyo, Japan', 'Seoul, South Korea',
    'Kuala Lumpur, Malaysia', 'Bangkok, Thailand', 'Jakarta, Indonesia',
    'Manila, Philippines', 'Ho Chi Minh City, Vietnam', 'Lagos, Nigeria',
    'Nairobi, Kenya', 'Cairo, Egypt', 'Casablanca, Morocco',
    'Johannesburg, South Africa', 'Cape Town, South Africa',
    'Sydney, Australia', 'Melbourne, Australia', 'Brisbane, Australia',
    'Auckland, New Zealand',
]

# Worldwide rotation: industries × regions, one slice per pipeline step.
INDUSTRY_QUERIES = [
    'web design agency', 'digital marketing agency', 'SaaS startup',
    'e-commerce brand', 'boutique law firm', 'dental clinic', 'real estate agency',
    'construction company', 'boutique hotel', 'fitness studio', 'IT consulting firm',
    'restaurant group', 'logistics company', 'architecture studio',
]

# Region detection — state + country for each lead, from the discovery query
# (e.g. 'dental clinic Salem Tamil Nadu' or 'hotels in Austin, USA') with the
# site TLD as fallback.
GLOBAL_CITY_STATE = {
    # India
    'salem': ('Tamil Nadu', 'India'), 'chennai': ('Tamil Nadu', 'India'),
    'coimbatore': ('Tamil Nadu', 'India'), 'madurai': ('Tamil Nadu', 'India'),
    'trichy': ('Tamil Nadu', 'India'), 'erode': ('Tamil Nadu', 'India'),
    'mumbai': ('Maharashtra', 'India'), 'pune': ('Maharashtra', 'India'),
    'nagpur': ('Maharashtra', 'India'), 'bengaluru': ('Karnataka', 'India'),
    'bangalore': ('Karnataka', 'India'), 'mysuru': ('Karnataka', 'India'),
    'hyderabad': ('Telangana', 'India'), 'delhi': ('Delhi', 'India'),
    'noida': ('Uttar Pradesh', 'India'), 'ahmedabad': ('Gujarat', 'India'),
    'surat': ('Gujarat', 'India'), 'jaipur': ('Rajasthan', 'India'),
    'kolkata': ('West Bengal', 'India'), 'kochi': ('Kerala', 'India'),
    'visakhapatnam': ('Andhra Pradesh', 'India'),
    # United States + Canada
    'new york': ('New York', 'United States'), 'san francisco': ('California', 'United States'),
    'los angeles': ('California', 'United States'), 'san diego': ('California', 'United States'),
    'chicago': ('Illinois', 'United States'), 'austin': ('Texas', 'United States'),
    'dallas': ('Texas', 'United States'), 'houston': ('Texas', 'United States'),
    'seattle': ('Washington', 'United States'), 'boston': ('Massachusetts', 'United States'),
    'miami': ('Florida', 'United States'), 'atlanta': ('Georgia', 'United States'),
    'denver': ('Colorado', 'United States'), 'phoenix': ('Arizona', 'United States'),
    'philadelphia': ('Pennsylvania', 'United States'),
    'toronto': ('Ontario', 'Canada'), 'vancouver': ('British Columbia', 'Canada'),
    'montreal': ('Quebec', 'Canada'), 'calgary': ('Alberta', 'Canada'),
    # United Kingdom + Ireland
    'london': ('England', 'United Kingdom'), 'manchester': ('England', 'United Kingdom'),
    'birmingham': ('England', 'United Kingdom'), 'glasgow': ('Scotland', 'United Kingdom'),
    'edinburgh': ('Scotland', 'United Kingdom'), 'dublin': ('Leinster', 'Ireland'),
    # Europe
    'berlin': ('Berlin', 'Germany'), 'munich': ('Bavaria', 'Germany'),
    'münchen': ('Bavaria', 'Germany'), 'munchen': ('Bavaria', 'Germany'),
    'hamburg': ('Hamburg', 'Germany'), 'frankfurt': ('Hesse', 'Germany'),
    'stuttgart': ('Baden-Württemberg', 'Germany'), 'cologne': ('North Rhine-Westphalia', 'Germany'),
    'amsterdam': ('North Holland', 'Netherlands'), 'rotterdam': ('South Holland', 'Netherlands'),
    'paris': ('Île-de-France', 'France'), 'madrid': ('Madrid', 'Spain'),
    'barcelona': ('Catalonia', 'Spain'), 'lisbon': ('Lisbon', 'Portugal'),
    'rome': ('Lazio', 'Italy'), 'milan': ('Lombardy', 'Italy'),
    'zurich': ('Zurich', 'Switzerland'), 'vienna': ('Vienna', 'Austria'),
    'stockholm': ('Stockholm', 'Sweden'), 'copenhagen': ('Capital Region', 'Denmark'),
    'oslo': ('Oslo', 'Norway'), 'helsinki': ('Uusimaa', 'Finland'),
    'warsaw': ('Masovia', 'Poland'), 'prague': ('Prague', 'Czech Republic'),
    'bucharest': ('Bucharest', 'Romania'), 'athens': ('Attica', 'Greece'),
    # Middle East + Asia
    'dubai': ('Dubai', 'UAE'), 'abu dhabi': ('Abu Dhabi', 'UAE'),
    'riyadh': ('Riyadh', 'Saudi Arabia'), 'doha': ('Doha', 'Qatar'),
    'istanbul': ('Istanbul', 'Turkey'), 'tel aviv': ('Tel Aviv', 'Israel'),
    'tokyo': ('Tokyo', 'Japan'), 'osaka': ('Osaka', 'Japan'),
    'seoul': ('Seoul', 'South Korea'), 'beijing': ('Beijing', 'China'),
    'shanghai': ('Shanghai', 'China'), 'hong kong': ('Hong Kong', 'Hong Kong'),
    'jakarta': ('Jakarta', 'Indonesia'), 'kuala lumpur': ('Selangor', 'Malaysia'),
    'bangkok': ('Bangkok', 'Thailand'), 'ho chi minh': ('Ho Chi Minh City', 'Vietnam'),
    'manila': ('Metro Manila', 'Philippines'), 'karachi': ('Sindh', 'Pakistan'),
    'dhaka': ('Dhaka', 'Bangladesh'),
    # Africa
    'cape town': ('Western Cape', 'South Africa'), 'johannesburg': ('Gauteng', 'South Africa'),
    'durban': ('KwaZulu-Natal', 'South Africa'), 'lagos': ('Lagos', 'Nigeria'),
    'nairobi': ('Nairobi', 'Kenya'), 'cairo': ('Cairo', 'Egypt'),
    'casablanca': ('Casablanca-Settat', 'Morocco'), 'accra': ('Greater Accra', 'Ghana'),
    # South America + Oceania
    'sao paulo': ('São Paulo', 'Brazil'), 'são paulo': ('São Paulo', 'Brazil'),
    'rio de janeiro': ('Rio de Janeiro', 'Brazil'), 'buenos aires': ('Buenos Aires', 'Argentina'),
    'santiago': ('Santiago', 'Chile'), 'bogota': ('Bogotá', 'Colombia'),
    'mexico city': ('Mexico City', 'Mexico'),
    'sydney': ('New South Wales', 'Australia'), 'melbourne': ('Victoria', 'Australia'),
    'brisbane': ('Queensland', 'Australia'), 'perth': ('Western Australia', 'Australia'),
    'adelaide': ('South Australia', 'Australia'), 'auckland': ('Auckland', 'New Zealand'),
    'brussels': ('Brussels', 'Belgium'), 'lima': ('Lima', 'Peru'),
}
CITY_RE = {c: re.compile(rf'\b{re.escape(c)}\b') for c in GLOBAL_CITY_STATE}

# Unambiguous ccTLDs for the last-resort country guess.  Deliberately excluded:
# .co/.io/.ai/.tv/.me (commercial tech domains that would mislabel leads).
TLD_COUNTRY = {
    # Europe
    '.in': 'India', '.de': 'Germany', '.uk': 'United Kingdom', '.us': 'United States',
    '.au': 'Australia', '.ca': 'Canada', '.nl': 'Netherlands', '.sg': 'Singapore',
    '.ae': 'UAE', '.ie': 'Ireland', '.es': 'Spain', '.za': 'South Africa',
    '.fr': 'France', '.it': 'Italy', '.pt': 'Portugal', '.be': 'Belgium',
    '.ch': 'Switzerland', '.at': 'Austria', '.se': 'Sweden', '.no': 'Norway',
    '.dk': 'Denmark', '.fi': 'Finland', '.pl': 'Poland', '.cz': 'Czech Republic',
    '.ro': 'Romania', '.gr': 'Greece', '.is': 'Iceland', '.sk': 'Slovakia',
    '.hu': 'Hungary', '.bg': 'Bulgaria', '.hr': 'Croatia', '.si': 'Slovenia',
    '.rs': 'Serbia', '.ua': 'Ukraine', '.ee': 'Estonia', '.lv': 'Latvia',
    '.lt': 'Lithuania', '.lu': 'Luxembourg', '.mt': 'Malta', '.cy': 'Cyprus',
    '.al': 'Albania', '.mk': 'North Macedonia', '.ba': 'Bosnia and Herzegovina',
    '.md': 'Moldova',
    # Americas
    '.mx': 'Mexico', '.br': 'Brazil', '.ar': 'Argentina', '.cl': 'Chile',
    '.pe': 'Peru', '.uy': 'Uruguay', '.py': 'Paraguay', '.bo': 'Bolivia',
    '.ec': 'Ecuador', '.ve': 'Venezuela', '.cr': 'Costa Rica', '.pa': 'Panama',
    '.gt': 'Guatemala', '.hn': 'Honduras', '.ni': 'Nicaragua', '.sv': 'El Salvador',
    '.do': 'Dominican Republic', '.jm': 'Jamaica', '.tt': 'Trinidad and Tobago',
    '.pr': 'Puerto Rico',
    # Asia
    '.cn': 'China', '.jp': 'Japan', '.kr': 'South Korea', '.tw': 'Taiwan',
    '.hk': 'Hong Kong', '.my': 'Malaysia', '.th': 'Thailand', '.vn': 'Vietnam',
    '.ph': 'Philippines', '.id': 'Indonesia', '.pk': 'Pakistan', '.bd': 'Bangladesh',
    '.lk': 'Sri Lanka', '.np': 'Nepal', '.kh': 'Cambodia', '.mm': 'Myanmar',
    '.mn': 'Mongolia', '.kz': 'Kazakhstan', '.uz': 'Uzbekistan', '.az': 'Azerbaijan',
    '.il': 'Israel', '.tr': 'Turkey', '.qa': 'Qatar', '.sa': 'Saudi Arabia',
    '.kw': 'Kuwait', '.bh': 'Bahrain', '.om': 'Oman', '.jo': 'Jordan',
    '.lb': 'Lebanon',
    # Africa + Oceania
    '.ng': 'Nigeria', '.ke': 'Kenya', '.eg': 'Egypt', '.ma': 'Morocco',
    '.gh': 'Ghana', '.tz': 'Tanzania', '.ug': 'Uganda', '.et': 'Ethiopia',
    '.rw': 'Rwanda', '.zm': 'Zambia', '.zw': 'Zimbabwe', '.bw': 'Botswana',
    '.na': 'Namibia', '.mz': 'Mozambique', '.sn': 'Senegal', '.cm': 'Cameroon',
    '.tn': 'Tunisia', '.dz': 'Algeria', '.mu': 'Mauritius', '.ao': 'Angola',
    '.mw': 'Malawi', '.fj': 'Fiji', '.pg': 'Papua New Guinea', '.nz': 'New Zealand',
}

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
EMAIL_JUNK = re.compile(r'\.(png|jpg|jpeg|gif|webp|svg|css|js)$', re.I)


REGIONS_PER_CYCLE = 3  # regions searched per pipeline cycle (world sweep /3 faster)

# ------------------------------------------------------------------
# Authorised scraping — robots.txt
# Every fetch the agents make (homepage, contact pages) is checked against
# the site's robots.txt first.  Missing/unreachable robots.txt means allowed
# (standard crawler practice); a disallow means we do not touch the site and
# hold the lead for human review instead.
# ------------------------------------------------------------------
_robots_cache = {}


def robots_allows(url):
    """True when robots.txt permits fetching this URL with our user agent."""
    from urllib.parse import urlparse as _urlparse
    from urllib.robotparser import RobotFileParser

    p = _urlparse(url if url.startswith('http') else 'https://' + url)
    base = f'{p.scheme}://{p.netloc}'
    rp = _robots_cache.get(base)
    if rp is None:
        rp = RobotFileParser()
        try:
            r = requests.get(base + '/robots.txt', headers={'User-Agent': USER_AGENT}, timeout=5)
            if r.status_code == 200 and r.text.strip():
                rp.parse(r.text.splitlines())
            else:
                rp.allow_all = True
        except requests.RequestException:
            rp.allow_all = True
        _robots_cache[base] = rp
    try:
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


def _cycle_slice(step_index, pool=None):
    """(query, industry) for the Nth rotation step.

    The region advances EVERY step (one full sweep per len(pool) steps) and
    the industry advances after each sweep — so consecutive steps always
    discover companies in new countries instead of drilling into one.
    pool = the regions to sweep (REGIONS worldwide, or the user's targets).
    """
    pool = pool or REGIONS
    region = pool[step_index % len(pool)]
    industry = INDUSTRY_QUERIES[(step_index // len(pool)) % len(INDUSTRY_QUERIES)]
    return f'{industry} in {region}', industry


def search_query_for_cycle(cycle_index, regions=None):
    """First query of the cycle — kept for one-off scripts and tests."""
    return _cycle_slice(cycle_index, _region_pool(regions))


def _region_pool(regions):
    """Restrict discovery to the given countries (Settings → Lead Targeting);
    anything unrecognized is dropped, empty → worldwide sweep."""
    if not regions:
        return None
    known = {r.lower(): r for r in REGIONS}
    return [known[r.lower()] for r in regions if r.lower() in known] or None


def search_queries_for_cycle(cycle_index, n=REGIONS_PER_CYCLE, regions=None):
    """n consecutive region slices for one cycle — each cycle spreads
    discovery over n different countries instead of a single one.
    regions restricts the sweep to the user's target countries."""
    pool = _region_pool(regions) or REGIONS
    start = cycle_index * n
    return [_cycle_slice(start + k, pool) for k in range(n)]


def region_from_query(query, website=''):
    """Guess (state, country) from the discovery query, falling back to the site TLD."""
    q = (query or '').lower()
    state = country = ''
    for city, (st, ctry) in GLOBAL_CITY_STATE.items():
        if CITY_RE[city].search(q):
            state, country = st, ctry
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


def region_from_text(text, prefer_country=''):
    """Detect (state, country) from a company's own page content.

    City names in the address/footer/contact block are the strongest signal a
    lead's site gives about where it actually is.  When several countries'
    cities appear, `prefer_country` (the discovery-query guess) wins; otherwise
    the country with the most distinct city mentions does.
    """
    t = (text or '').lower()
    hits = {}  # country -> (state, distinct city count)
    for city, (st, ctry) in GLOBAL_CITY_STATE.items():
        if CITY_RE[city].search(t):
            prev = hits.get(ctry)
            hits[ctry] = (st, prev[1] + 1 if prev else 1)
    if not hits:
        return '', ''
    if prefer_country and prefer_country in hits:
        return hits[prefer_country][0], prefer_country
    best = max(hits.items(), key=lambda kv: kv[1][1])
    return best[1][0], best[0]


def name_from_domain(domain):
    """'mabya.com' → 'Mabya' — clean fallback when the result title is garbage."""
    base = domain.split('.')[0]
    return base[:1].upper() + base[1:] if base else domain


def _plausible_company_name(name, domain):
    """Reject garbled SERP titles ('Buy or acquire E', sentences, one-liners)."""
    if not name or len(name) < 4 or len(name) > 60:
        return False
    if '/' in name or name.lower().startswith('http'):  # 'wsp.com/en' — a URL, not a brand
        return False
    if any(len(w) == 1 for w in name.split() if w.lower() not in ('a', '&')):  # '…acquire E'
        return False
    if re.search(r'\b(acquire|buy|sale|for sale|jobs?|career|hiring|review|best|top \d+)\b', name, re.I):
        return False
    if re.match(r'^(build|get|create|learn|how to|what (is|are)|discover|explore|the (best|top|ultimate))\b',
                name, re.I):
        return False  # 'Build a Website or Web App With AI' — a headline, not a company
    if re.search(r'one moment|just a moment|attention required|checking your browser|'
                 r'verify you are human|enable javascript', name, re.I):
        return False  # bot-challenge page title ('One moment, please…') — not a name
    return True


def _generic_serp_title(name, query):
    """True when the SERP title is just the query echoed back ('Web Design
    Agency in Germany') — an SEO landing page or directory, not a brand."""
    norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    industry = query.split(' in ')[0] if ' in ' in query else query
    title, phrase = norm(name), norm(industry)
    return bool(phrase) and (title == phrase or title == norm(query))


def search_companies(query, n=8):
    """Real DuckDuckGo search → [{name, website, snippet}] for company homepages.

    DDG rate-limits rapid consecutive queries (they return 0 results, not an
    error), so an empty first response is retried once after a short pause.
    """
    from ddgs import DDGS

    def _run_once():
        results = []
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=n * 4):
                    url = (r.get('href') or r.get('url') or '').strip()
                    if not url:
                        continue
                    parsed = urlparse(url)
                    domain = parsed.netloc.lower()
                    domain = domain.split(':')[0]  # strip :port — 'awwwards.com:8080'
                    domain = domain[4:] if domain.startswith('www.') else domain
                    if not domain or any(domain == b or domain.endswith('.' + b) for b in BLOCKED_DOMAINS):
                        continue
                    if domain == 'google' or domain.endswith('.google'):  # Google's own .google TLD
                        continue
                    if domain.endswith(('.gov', '.gov.uk', '.mil', '.edu', '.ac.uk')):  # institutions
                        continue
                    # deep subdomains of a .com/.net/.org parent (x.y.z.com) are
                    # directory/stats pages, never a company homepage
                    if (domain.count('.') >= 3
                            and domain.split('.')[-1] in ('com', 'net', 'org')):
                        continue
                    path = parsed.path or '/'
                    # deep links are job listings / articles, not company homepages
                    if len(path) > 40 or path.count('/') > 2 or '?' in url:
                        continue
                    title = (r.get('title') or '').strip()
                    # 'Company Name | Services…' / 'Company Name — Home' → keep the brand part
                    name = re.split(r'\s*[|–—·-]\s*', title)[0].strip()
                    if _generic_serp_title(name, query):
                        continue  # SEO landing page echoing the query — not a company
                    if not _plausible_company_name(name, domain):
                        name = name_from_domain(domain)
                    results.append({'name': name, 'website': domain, 'snippet': r.get('body', '')[:200]})
                    if len(results) >= n:
                        break
        except Exception as exc:  # network hiccup, rate limit — never kill a cycle
            log.warning('DDG search failed for %r: %s', query, exc)
        return results

    results = _run_once()
    if not results:
        time.sleep(6)  # rate-limited — one patient retry before giving up
        results = _run_once()
    return results


def scrape_company(url):
    """Fetch a page. Returns {ok, status, final_url, https, load_ms, html, error}.
    Fetches disallowed by the site's robots.txt are never attempted."""
    if not url.startswith('http'):
        url = 'https://' + url
    if not robots_allows(url):
        return {
            'ok': False, 'status': 0, 'final_url': url,
            'https': url.startswith('https://'), 'load_ms': 0,
            'html': '', 'error': 'disallowed by robots.txt', 'robots_blocked': True,
        }
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


def analyze_website(name, website, prefer_country=''):
    """Full audit of one company's web presence.

    Returns {has_website, score, contact_email, findings, analysis, state, country}
    where score (40–98) is sales potential: more fixable flaws → higher score.
    state/country come from the site's own content when it names a city we know
    (empty otherwise — the caller keeps its discovery-query guess).
    """
    analysis = {'checked_url': website or '', 'pages_fetched': 0}
    findings = []
    found_state = found_country = ''

    if not website:
        findings.append(_finding(
            'Web presence', 'high', 50,
            f'{name} has no website at all.',
            'Pitch an end-to-end website: domain, landing pages, SEO setup and a booking/contact funnel.'))
        return {'has_website': False, 'score': 95, 'contact_email': '',
                'findings': findings, 'analysis': analysis,
                'state': found_state, 'country': found_country}

    page = scrape_company(website)
    if not page['ok'] and page.get('robots_blocked'):
        # the site asks crawlers to keep out — we honour that and hold the
        # lead for human review instead of silently scraping it anyway
        findings.append(_finding(
            'Web presence', 'info', 0,
            f'Scraping is disallowed by {website}\'s robots.txt — not audited, out of respect for the site\'s policy.',
            'Manually review this lead before any outreach.'))
        analysis['blocked'] = True
        return {'has_website': True, 'score': 40, 'contact_email': '',
                'findings': findings, 'analysis': analysis,
                'state': found_state, 'country': found_country}
    if not page['ok']:
        # retry with www. before declaring the site dead
        if not website.startswith('www.') and ' ' not in website:
            page = scrape_company('https://www.' + website)
    analysis['checked_url'] = page['final_url']
    if not page['ok']:
        # 403/429/503 = bot protection, not a dead site. The company exists —
        # claiming "no website" in outreach would be false, so record the
        # block honestly and let the pipeline hold these for human review.
        if page['status'] in (403, 429, 503):
            findings.append(_finding(
                'Web presence', 'info', 0,
                f'Website blocked automated access (HTTP {page["status"]}) — '
                f'site is live but could not be audited.',
                'Manually review this site before any outreach.'))
            analysis['blocked'] = True
            return {'has_website': True, 'score': 40, 'contact_email': '',
                    'findings': findings, 'analysis': analysis,
                    'state': found_state, 'country': found_country}
        findings.append(_finding(
            'Web presence', 'high', 45,
            f'Website unreachable ({page["error"] or "HTTP %d" % page["status"]}).',
            'Their web presence is broken or missing — pitch a rebuild with reliable hosting.'))
        return {'has_website': False, 'score': 92, 'contact_email': '',
                'findings': findings, 'analysis': analysis,
                'state': found_state, 'country': found_country}

    analysis['pages_fetched'] = 1
    analysis.update({'http_status': page['status'], 'https': page['https'],
                     'load_ms': page['load_ms'], 'bytes': len(page['html'])})
    soup = BeautifulSoup(page['html'], 'lxml')

    # parked/for-sale landing pages — the domain resolves but there is no real
    # site behind it, which for our purposes means "no working website"
    page_title = (soup.title.string or '').strip() if soup.title and soup.title.string else ''
    if re.search(r'parked domain|domain (is )?(parked|for sale)|buy this domain|sedoparking', page_title, re.I):
        findings.append(_finding(
            'Web presence', 'high', 45,
            f'Domain is parked ({page_title[:60]}) — no real website is live.',
            'Pitch an end-to-end website: their domain is wasting the traffic it gets.'))
        return {'has_website': False, 'score': 92, 'contact_email': '',
                'findings': findings, 'analysis': analysis,
                'state': found_state, 'country': found_country}

    # bot-challenge interstitials (Cloudflare 'One moment, please…', 'Just a
    # moment…') — the site is live but the audit would be reading the challenge
    # page, not the company's content
    if re.search(r'one moment|just a moment|attention required|checking your browser|'
                 r'verify you are human', page_title, re.I):
        findings.append(_finding(
            'Web presence', 'info', 0,
            'Website protected by a bot challenge — it is live but could not be audited.',
            'Manually review this site before any outreach.'))
        analysis['blocked'] = True
        return {'has_website': True, 'score': 40, 'contact_email': '',
                'findings': findings, 'analysis': analysis,
                'state': found_state, 'country': found_country}

    # one text extraction reused for the region scan and the content check —
    # the address/footer usually names the company's city
    page_text = soup.get_text(' ', strip=True)
    found_state, found_country = region_from_text(page_text, prefer_country)
    # visible-text excerpt for the AI (Gemini) description step in the pipeline
    analysis['text_excerpt'] = page_text[:4000]

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

    text_len = len(page_text)
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
            'findings': findings, 'analysis': analysis,
            'state': found_state, 'country': found_country}
