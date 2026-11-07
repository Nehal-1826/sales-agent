"""Discovery volume + query expansion (free sources only).

* `expand_queries()` — each base (industry, place) slice gets phrasing
  variants rotated across cycles ('{industry} in {place}', 'best {industry}
  {place}', '{industry} near {area}' …), so repeated cycles surface new
  businesses instead of the same top results.
* `next_widen_level()` — adaptive volume: when the previous cycle's results
  were mostly already known, widen (more variants, then neighbouring cities
  of the same state from scraper.GLOBAL_CITY_STATE); narrow again when new
  leads flow.  The level lives in the last PipelineRun.summary['discovery']
  (no extra model fields).
"""

import re

from .scraper import GLOBAL_CITY_STATE, QUERY_TEMPLATES

# phrasing variants rotated per cycle — '{area}' = a neighbouring city
VARIANT_TEMPLATES = [
    '{industry} in {place}',
    'best {industry} {place}',
    '{industry} near {area}',
    'top {industry} companies {place}',
    '{industry} {place} contact',
    'local {industry} {place}',
]
MAX_WIDEN_LEVEL = 3
QUERIES_HARD_CAP = 60          # never more search queries per cycle than this
LOW_NEW_RATIO = 0.25           # < 25 % of candidates new → widen
HIGH_NEW_RATIO = 0.6           # > 60 % new → narrow back
LOW_NEW_LEADS = 10

_PATTERNS = None


def _patterns():
    global _PATTERNS
    if _PATTERNS is None:
        pats = []
        for t in set(QUERY_TEMPLATES) | set(VARIANT_TEMPLATES):
            if '{place}' not in t:
                continue
            rx = re.escape(t).replace(r'\{industry\}', r'(?P<industry>.+?)').replace(
                r'\{place\}', r'(?P<place>.+)')
            pats.append(re.compile(f'^{rx}$', re.I))
        _PATTERNS = pats
    return _PATTERNS


def place_of(query, industry):
    """The place part of a built query ('dentist in Salem' → 'Salem')."""
    for rx in _patterns():
        m = rx.match(query)
        if m and m.group('industry').lower() == industry.lower():
            return m.group('place').strip()
    if ' in ' in query:
        return query.rsplit(' in ', 1)[-1].strip()
    return ''


def neighbours(place, limit=2):
    """Other known cities in the same state as `place` (alphabetical, stable)."""
    city = place.split(',')[0].strip().lower()
    if city not in GLOBAL_CITY_STATE:
        return []
    state = GLOBAL_CITY_STATE[city]
    near = sorted(c for c, s in GLOBAL_CITY_STATE.items() if s == state and c != city)
    return [c.title() for c in near[:limit]]


def expand_queries(base, cycle, level=0, cap=QUERIES_HARD_CAP):
    """base = [(query, industry)] from scraper.search_queries_for_cycle.
    Returns the base slices first, then rotated phrasing variants: level 0 →
    +1 variant per slice, level ≥ 1 → +2, level 2 → also the industry in one
    neighbouring city of the same state, level 3 → two.  Deduped, capped."""
    out, seen = [], set()

    def add(q, ind):
        k = q.lower()
        if k not in seen and len(out) < cap:
            seen.add(k)
            out.append((q, ind))

    for q, ind in base:
        add(q, ind)
    n_variants = 1 if level <= 0 else 2
    for k in range(n_variants):
        for i, (q, ind) in enumerate(base):
            place = place_of(q, ind)
            if not place:
                continue
            # never index 0 — that phrasing is the base query itself
            t = VARIANT_TEMPLATES[1 + (cycle + i + k) % (len(VARIANT_TEMPLATES) - 1)]
            add(t.format(industry=ind, place=place, area=place), ind)
    if level >= 2:
        for q, ind in base:
            for city in neighbours(place_of(q, ind), level - 1):
                add(f'{ind} in {city}', ind)
    return out


def next_widen_level(previous):
    """previous = PipelineRun.summary['discovery'] of the last cycle (or {})."""
    level = int((previous or {}).get('widen_level', 0) or 0)
    candidates = int((previous or {}).get('candidates', 0) or 0)
    new = int((previous or {}).get('new', 0) or 0)
    if not previous:
        return 0
    ratio = new / candidates if candidates else 0.0
    if new < LOW_NEW_LEADS or ratio < LOW_NEW_RATIO:
        return min(MAX_WIDEN_LEVEL, level + 1)
    if ratio > HIGH_NEW_RATIO:
        return max(0, level - 1)
    return level


def last_discovery_stats():
    """summary['discovery'] of the latest PipelineRun in this workspace."""
    from .models import PipelineRun
    run = PipelineRun.objects.order_by('-started_at').only('summary').first()
    return ((run.summary or {}).get('discovery') or {}) if run else {}
