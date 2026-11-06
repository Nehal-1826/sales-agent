"""Maps-first lead funnel: simple NLP prefilter → one batched AI fit check.

Google Maps listings (name, category, address, website) are the candidates.
1. `nlp_prefilter` — keyword rules, no network, drops listicles, portals,
   social pages and obvious non-buyers, and keeps the rest.
2. `ai_fit_batch` — one LLM call per 20 candidates answers FIT / NOT_FIT.
   Strict like the rest of the pipeline: a candidate the AI did not clearly
   answer is held (not admitted). With no AI key configured the NLP survivors
   pass (keyless demo mode), matching `_ai_review`.
Only FIT candidates become leads; the caller profiles and drafts them."""

import logging
import re
from urllib.parse import urlparse

from .ai import llm_available, llm_complete

log = logging.getLogger(__name__)

BATCH_SIZE = 20

# words that mark a listicle, guide, portal or directory page, not a company
NOT_A_COMPANY = re.compile(
    r'\b(list of|top \d+|best \d+|\d+ best|directory|guide|review|reviews|blog|news|'
    r'jobs?|careers?|magazine|forum|wiki|compare|comparison|how to|what is|near me)\b', re.I)
# buyers we never want, plus our own competitors (agencies that sell the same work)
UNRELATED = re.compile(
    r'\b(school|college|clinic|hospital|dental|restaurant|cafe|salon|gym|mosque|church|'
    r'pharmacy|auto|car wash|laundry|tailor|bakery|web design|web development|digital marketing|'
    r'seo|software development|app development|it solutions|it services|software company)\b', re.I)
# words that suggest a real property business (the target)
PROPERTY = re.compile(
    r'\b(real ?estate|realty|property|properties|propert(y|ies) management|brokers?|brokerage|'
    r'developers?|development|holiday homes?|vacation homes?|short[- ]term rental|rentals?|'
    r'off[- ]plan|villas?|apartments?|agency|agents?|homes?)\b', re.I)
PORTAL_DOMAINS = {
    'bayut.com', 'propertyfinder.ae', 'dubizzle.com', 'justproperty.com', 'zillow.com',
    'realtor.com', 'rightmove.co.uk', 'zoopla.co.uk', 'housesigma.com', 'wikipedia.org',
}


def _domain(url):
    host = urlparse(url or '').netloc.lower() or (url or '').lower()
    host = host.split('/', 1)[0].split(':', 1)[0]
    return host[4:] if host.startswith('www.') else host


def nlp_prefilter(places):
    """Keep Maps places that look like a real property business. Returns a list."""
    kept, seen = [], set()
    for p in places:
        domain = _domain(p.get('website', ''))
        name = p.get('name', '') or ''
        text = f'{name} {p.get("category", "")}'
        if not domain or domain in seen or domain in PORTAL_DOMAINS:
            continue
        if any(domain == d or domain.endswith('.' + d) for d in PORTAL_DOMAINS):
            continue
        if NOT_A_COMPANY.search(text) or NOT_A_COMPANY.search(domain):
            continue
        if UNRELATED.search(text):
            continue
        if not PROPERTY.search(text):
            continue
        seen.add(domain)
        kept.append(p)
    return kept


_LINE = re.compile(r'^\s*(\d+)\s*[:.)-]\s*(FIT|NOT_FIT)\b', re.I | re.M)


def _prompt(batch, goal):
    rows = '\n'.join(
        f'{i}. {p.get("name", "")} | category: {p.get("category", "") or "-"} | '
        f'website: {_domain(p.get("website", ""))} | address: {p.get("address", "") or "-"}'
        for i, p in enumerate(batch, 1))
    return (
        f'{goal}\n\n'
        'For each numbered business, answer whether it is a real operating business that '
        'would buy custom software (CRM, WhatsApp automation, booking/portal, mobile app). '
        'NOT_FIT for blogs, directories, listicles, portals, agencies that build websites or '
        'software themselves, and unrelated sectors.\n\n'
        f'{rows}\n\n'
        'Answer with EXACTLY one line per business, nothing else:\n'
        '<number>: FIT or NOT_FIT - <3-6 word reason>')


def ai_fit_batch(places, goal):
    """Return a list of (place, fit) for places the AI answered clearly, in order.
    Returns None for batches the AI could not answer (caller holds them)."""
    if not places:
        return []
    if not llm_available():
        return [(p, True) for p in places]  # keyless demo mode: NLP survivors pass
    out = []
    for start in range(0, len(places), BATCH_SIZE):
        batch = places[start:start + BATCH_SIZE]
        try:
            text = llm_complete(_prompt(batch, goal),
                                system='You classify sales leads strictly from the given facts.',
                                temperature=0)
        except Exception as exc:  # network / quota: hold this batch
            log.warning('Maps AI fit batch failed: %s', exc)
            text = None
        if not text:
            continue  # strict: an unanswered batch admits nobody
        answers = {int(m.group(1)): m.group(2).upper() == 'FIT' for m in _LINE.finditer(text)}
        for i, place in enumerate(batch, 1):
            if i in answers:
                out.append((place, answers[i]))
    return out
