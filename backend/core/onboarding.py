"""Chat onboarding — first-login setup answered in plain text.

The wizard lives in the Chat page: the bot asks, the operator answers in
normal language, each answer is parsed and applied to the live settings
immediately.  Progress is stored PER USER (User.onboarding) so every new
client login gets the wizard — existing users were marked done in migration
0017 and are never hijacked.  Works with zero AI key (pure heuristics for
the standard steps; the ICP step uses the LLM when available for sharper
extraction, and falls back to storing the raw text).

    onboarding_status(user, settings)  → is the wizard active + current question
    onboarding_reply(text, user, settings) → parse one answer, apply, advance
"""

import json
import re

from .models import AppSettings, SearchProfile

# ------------------------------------------------------------------
# Country aliases — chat answers like "us, uk" must map onto the region
# names the discovery sweep actually knows (scraper.REGIONS).
# ------------------------------------------------------------------

COUNTRY_ALIASES = {
    'us': 'United States', 'usa': 'United States', 'u.s.': 'United States',
    'u.s.a.': 'United States', 'united states': 'United States',
    'united states of america': 'United States', 'america': 'United States',
    'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'britain': 'United Kingdom',
    'england': 'United Kingdom', 'great britain': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'germany': 'Germany', 'deutschland': 'Germany',
    'india': 'India', 'bharat': 'India',
    'uae': 'UAE', 'dubai': 'UAE', 'united arab emirates': 'UAE',
    'canada': 'Canada', 'australia': 'Australia', 'singapore': 'Singapore',
    'netherlands': 'Netherlands', 'holland': 'Netherlands',
    'france': 'France', 'spain': 'Spain', 'italy': 'Italy',
    'switzerland': 'Switzerland', 'austria': 'Austria', 'sweden': 'Sweden',
    'norway': 'Norway', 'denmark': 'Denmark', 'finland': 'Finland',
    'ireland': 'Ireland', 'poland': 'Poland', 'portugal': 'Portugal',
    'belgium': 'Belgium', 'israel': 'Israel', 'japan': 'Japan',
    'south africa': 'South Africa', 'new zealand': 'New Zealand',
    'saudi arabia': 'Saudi Arabia', 'qatar': 'Qatar',
}

WORLDWIDE_WORDS = {'worldwide', 'everywhere', 'anywhere', 'all', 'global',
                   'anywhere in the world', 'all countries', 'everywhere in the world'}

DOMAIN_RE = re.compile(r'\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b', re.I)
EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

# ------------------------------------------------------------------
# Steps — (key, required, question, hint shown in the chat bubble)
# ------------------------------------------------------------------

STEPS = [
    ('company', True,
     'First — what should I call your company? Just the name is perfect.',
     'e.g. "Support Icon"'),
    ('services', True,
     'Nice! What do you sell? A few words are enough — I use this to write '
     'your outreach emails and pick the right leads.',
     'e.g. "customer support outsourcing, ticket handling, live chat support"'),
    ('website', True,
     'What\'s your website? (I need it for the email signature and to never '
     'pitch your own company by accident.)',
     'e.g. "supporticon.com"'),
    ('target', True,
     'Who should I find for you?\n'
     '• BUSINESSES that buy your services (clinics, SaaS companies, e-commerce…), or\n'
     '• other AGENCIES / software shops you want project partnerships with?',
     '"agencies" or "buyers" — one word is enough'),
    ('countries', True,
     'Which countries should I search? Name a few, or say "worldwide".',
     'e.g. "US, UK, Germany" or "worldwide" or "India"'),
    ('icp', False,
     'Now the important one: describe your IDEAL CLIENT — industries, company '
     'size, geography, any signals (funding, hiring, tools they use). Type it '
     'out or attach a file. I\'ll use this to pick better leads and write '
     'sharper emails. Or say "skip".',
     'e.g. "e-commerce brands doing 100k+/mo, US, hiring CS agents" — or attach a file'),
    ('ai_key', False,
     'Optional: paste your AI provider API key so I can write smarter, '
     'personalized outreach — or say "skip".',
     'e.g. an OpenAI / Gemini key, or "skip"'),
    ('email', False,
     'Last one (optional): want outreach emails to actually SEND? Paste your '
     'mailbox and app password like hello@yourdomain.com:apppassword — or say "skip". '
     'You can also connect it later in Settings → Email Delivery.',
     'hello@yourdomain.com:apppassword or "skip"'),
]

STEP_KEYS = [s[0] for s in STEPS]

SKIP_WORDS = {'skip', 'skip it', 'later', 'not now', 'no', 'nah', 'nope',
              'skip for now', 'ill do it later', "i'll do it later", 'pass'}


def _load_state(user):
    return dict(getattr(user, 'onboarding', None) or {})


def _save_state(user, **patch):
    state = _load_state(user)
    state.update(patch)
    user.onboarding = state
    user.save(update_fields=['onboarding'])
    return state


def onboarding_status(user=None, settings=None):
    """Wizard state for the frontend: {needed, done, stepIndex, stepCount,
    stepKey, question, hint, progress} — needed=False once done/skipped."""
    settings = settings or AppSettings.load()
    if user is None or user.is_anonymous:
        return {'needed': False, 'done': True, 'stepIndex': 0, 'stepCount': len(STEPS),
                'stepKey': '', 'question': '', 'hint': '', 'progress': ''}
    state = _load_state(user)
    if state.get('done'):
        return {'needed': False, 'done': True, 'stepIndex': 0, 'stepCount': len(STEPS),
                'stepKey': '', 'question': '', 'hint': '', 'progress': ''}
    step = min(int(state.get('step') or 0), len(STEPS) - 1)
    key, _req, question, hint = STEPS[step]
    return {
        'needed': True,
        'done': False,
        'stepIndex': step,
        'stepCount': len(STEPS),
        'stepKey': key,
        'question': question,
        'hint': hint,
        'progress': f'Setup step {step + 1} of {len(STEPS)} — {key.replace("_", " ")}',
    }


# ------------------------------------------------------------------
# Answer parsers — heuristics, no AI needed
# ------------------------------------------------------------------

def _clean_name(text):
    t = ' '.join(text.split())
    t = re.sub(r'^(hi|hello|hey|vanakkam)[,!.\s]+', '', t, flags=re.I)
    t = re.sub(r"^(i am|i'm|we are|we're|it's|its|my company(?:'s)? (?:name)? ?is|"
               r"our company(?:'s)? ?is|this is|iam|im)\s+", '', t, flags=re.I)
    t = re.sub(r'\s*(thanks|thank you|please)\s*$', '', t, flags=re.I)
    t = t.strip(' .!,-"\'')
    return t[:60]


def _parse_services(text):
    parts = re.split(r'[,;\n]|\band\b', text)
    items = []
    for part in parts:
        part = _clean_name(part)
        if part and len(part) > 1 and part.lower() not in SKIP_WORDS:
            items.append(part[:60])
    return items[:6]


def _parse_website(text):
    m = DOMAIN_RE.search(text)
    if m:
        domain = m.group(1).lower()
        return domain[4:] if domain.startswith('www.') else domain
    return ''


def _parse_target(text):
    t = text.lower()
    if re.search(r'agenc|partner|white[- ]label|studio|software (shop|house|company)|outsourc|collab|sub ?contract', t):
        return 'agency'
    return 'buyer'


def _parse_countries(text):
    t = text.lower().strip()
    if any(w in t for w in WORLDWIDE_WORDS):
        return []
    from .scraper import REGIONS
    known = {r.lower(): r for r in REGIONS}
    found = []
    for token in re.split(r'[,;\n]|\band\b', t):
        token = token.strip(' .')
        if not token:
            continue
        country = COUNTRY_ALIASES.get(token) or known.get(token)
        if not country:  # partial match, e.g. "united kin"
            country = next((r for k, r in known.items() if k.startswith(token)), None)
        if country and country not in found:
            found.append(country)
    return found


def _looks_like_key(text):
    t = text.strip()
    return bool(re.match(r'^(sk-|AIza|ghp_|gsk_|xai-|rz-|gl-|[A-Za-z0-9_-]{28,})', t)) and ' ' not in t


def _provider_for_key(key):
    if key.startswith('AIza'):
        return 'Google AI'
    if key.startswith('sk-'):
        return 'OpenAI'
    return 'Zhipu (GLM)'


def _parse_mailbox(text):
    """'hello@x.com:appword' / 'hello@x.com appword' / 'hello@x.com / appword'."""
    m = EMAIL_RE.search(text)
    if not m:
        return '', ''
    email = m.group(0).lower()
    rest = text[m.end():].lstrip(' :/|-')
    password = rest.strip().split()[0] if rest.strip() else ''
    return email, password


# ------------------------------------------------------------------
# ICP step — freeform text (typed or uploaded file content)
# ------------------------------------------------------------------

def _extract_icp(text, settings):
    """LLM extracts structure from the ideal-client description; anything
    unparseable degrades to storing the raw notes (which still steer the
    AI vetting + drafting prompts).  Returns (industries, countries)."""
    industries, countries = [], []
    try:
        from .ai import llm_available, llm_complete
        if not llm_available():
            return industries, countries
        raw = llm_complete(
            f'IDEAL CLIENT PROFILE (freeform):\n{text[:4000]}\n\n'
            f'Extract structured targeting from it. Respond with ONLY minified JSON: '
            f'{{"industries":["…"],"countries":["…"]}} — industries are SEARCH PHRASES '
            f'(like "dental clinic", "SaaS startup", "e-commerce brand"); countries use '
            f'full names (like "United States"). Empty lists when not stated. No markdown.',
            system='You extract structured lead-targeting from freeform ICP descriptions.',
            timeout=45) or ''
        m = re.search(r'\{.*\}', raw.replace('```', ''), re.S)
        data = json.loads(m.group(0)) if m else {}
        industries = [str(i).strip()[:60] for i in (data.get('industries') or [])
                      if str(i).strip()][:8]
        countries = [str(c).strip() for c in (data.get('countries') or [])
                     if str(c).strip()][:6]
    except Exception:
        pass
    return industries, countries


def _apply_icp(text, settings):
    """Store the raw ICP and merge LLM-extracted targeting into the settings.
    Returns a human summary of what was captured."""
    settings.icp_notes = text.strip()[:6000]
    parsed_industries, parsed_countries = _extract_icp(text, settings)

    # countries: only ADD when both sides name real regions we know
    known_current = _parse_countries(settings.target_countries)
    for c in parsed_countries:
        mapped = _parse_countries(c)
        for real in mapped:
            if real not in known_current:
                known_current.append(real)
    if known_current:
        settings.target_countries = ', '.join(known_current)

    current_industries = [i.strip() for i in re.split(r'[,\n]', settings.target_industries) if i.strip()]
    for ind in parsed_industries:
        if ind.lower() not in {i.lower() for i in current_industries}:
            current_industries.append(ind)
    if current_industries:
        settings.target_industries = ', '.join(current_industries)

    settings.save(update_fields=['icp_notes', 'target_countries',
                                 'target_industries', 'updated_at'])
    bits = []
    if parsed_industries:
        bits.append('industries: ' + ', '.join(parsed_industries[:4]))
    if parsed_countries:
        bits.append('geography: ' + ', '.join(parsed_countries[:3]))
    return ('Locked in your ideal client profile' +
            (f' — {"; ".join(bits)}' if bits else
             ' — I\'ll use these notes to steer lead vetting and every email')) + '.'


# ------------------------------------------------------------------
# The wizard turn — parse the current answer, apply, advance
# ------------------------------------------------------------------

def _question_message(step_index, prefix=''):
    key, _req, question, hint = STEPS[step_index]
    text = f'{prefix}{question}\n({hint})' if hint else f'{prefix}{question}'
    return text


def _finish(settings, user):
    """Wizard complete: snapshot the chat-set targeting as the active
    profile so one-click switching starts from a true picture."""
    _save_state(user, done=True)
    answers = _load_state(user).get('answers') or {}
    profile, _ = SearchProfile.objects.get_or_create(
        name='Setup — chat wizard',
        defaults={'description': 'Targeting configured in the first-login chat setup.'})
    profile.target_countries = settings.target_countries
    profile.target_industries = settings.target_industries
    profile.target_cities = settings.target_cities
    profile.icp_mode = settings.icp_mode or 'buyer'
    SearchProfile.objects.exclude(pk=profile.pk).update(is_active=False)
    profile.is_active = True
    profile.save()
    return (
        'That\'s everything — you\'re set up! 🎉 Here\'s what I\'ll do: discover '
        f'{answers.get("target_mode", "buyer") == "agency" and "agency partners" or "buyer businesses"} '
        f'in {settings.target_countries or "a worldwide sweep"}, draft the outreach emails, and wait '
        'for your approval before anything sends. '
        'From now on just tell me things in plain chat — "run a cycle", "approve the draft for <company>", '
        '"switch to the backup profile", "pause the runs". Want me to run the first cycle now?'
    )


def onboarding_reply(text, user, settings=None):
    """Handle one user message while the wizard is active for THIS user.
    Returns the bot's reply (never raises — any parse failure re-asks)."""
    settings = settings or AppSettings.load()
    state = _load_state(user)
    answers = dict(state.get('answers') or {})
    step = min(int(state.get('step') or 0), len(STEPS) - 1)
    key = STEPS[step][0]
    lowered = text.strip().lower()

    # global escape hatch works at every step
    if re.search(r'\bskip\b.*\bsetup\b|skip\b.*(setup|wizard)|not now|do this later|cancel setup', lowered):
        _save_state(user, done=True, skipped=True)
        return ('No problem — setup skipped. Everything is also configurable in Settings, '
                'and I\'m here in chat whenever you need me.')

    if not state.get('started'):
        _save_state(user, started=True)

    # ---------------- per-step parsing ----------------
    if key == 'company':
        name = _clean_name(text)
        if len(name) < 2:
            return 'Hmm, I didn\'t catch a name — what should I call your company?'
        settings.company_name = name
        settings.save(update_fields=['company_name', 'updated_at'])
        answers['company'] = name
        _save_state(user, step=1, answers=answers)
        return _question_message(1, prefix=f'Nice to meet you, {name}! 👋 ')

    if key == 'services':
        services = _parse_services(text)
        if not services:
            return 'Give me at least one thing you sell — e.g. "customer support, ticket handling, live chat".'
        settings.services = services
        settings.save(update_fields=['services', 'updated_at'])
        answers['services'] = services
        _save_state(user, step=2, answers=answers)
        return _question_message(2)

    if key == 'website':
        domain = _parse_website(text)
        if not domain:
            return 'That doesn\'t look like a domain — try something like "yourcompany.com".'
        settings.company_website = domain
        settings.save(update_fields=['company_website', 'updated_at'])
        answers['website'] = domain
        _save_state(user, step=3, answers=answers)
        return _question_message(3, prefix='Got it. ')

    if key == 'target':
        mode = _parse_target(text)
        settings.icp_mode = mode
        settings.save(update_fields=['icp_mode', 'updated_at'])
        answers['target_mode'] = mode
        _save_state(user, step=4, answers=answers)
        label = ('other agencies and software shops — partnership mode 🔓'
                 if mode == 'agency' else 'businesses that buy what you sell')
        return (f'Understood — I\'ll hunt {label}. '
                + _question_message(4).replace('\n', ' ', 1).lstrip())

    if key == 'countries':
        countries = _parse_countries(text)
        if not countries and not any(w in lowered for w in WORLDWIDE_WORDS):
            return ('I couldn\'t map any country names in that — try "US, UK, Germany", '
                    '"India" or just "worldwide".')
        settings.target_countries = ', '.join(countries)
        settings.save(update_fields=['target_countries', 'updated_at'])
        answers['countries'] = countries or ['worldwide']
        _save_state(user, step=5, answers=answers)
        if countries:
            return _question_message(5, prefix=f'Locked: {", ".join(countries)}. ')
        return _question_message(5, prefix='Worldwide sweep it is — the whole rotation. ')

    if key == 'icp':
        if lowered in SKIP_WORDS or len(text.strip()) < 8:
            answers['icp'] = 'skipped'
            _save_state(user, step=6, answers=answers)
            return _question_message(6, prefix='No problem — I\'ll keep the default targeting. ')
        summary = _apply_icp(text, settings)
        answers['icp'] = 'set'
        _save_state(user, step=6, answers=answers)
        return _question_message(6, prefix=summary + ' ')

    if key == 'ai_key':
        if lowered not in SKIP_WORDS and _looks_like_key(text):
            settings.ai_key = text.strip()
            settings.ai_provider = _provider_for_key(text.strip())
            settings.save(update_fields=['ai_key', 'ai_provider', 'updated_at'])
            answers['ai_key'] = 'set'
            _save_state(user, step=7, answers=answers)
            return _question_message(7, prefix='Key saved 🔑 — I can now write and vet with AI. ')
        answers['ai_key'] = 'skipped'
        _save_state(user, step=7, answers=answers)
        return _question_message(7, prefix='No problem, template mode works fine. ')

    if key == 'email':
        if lowered not in SKIP_WORDS:
            email, password = _parse_mailbox(text)
            if email and password:
                from .mailer import connect_mailbox
                provider = 'gmail' if re.search(r'@(gmail|googlemail)\.', email) else 'zoho'
                result = connect_mailbox(provider, email, password)
                if result.get('ok'):
                    answers['email'] = email
                    _save_state(user, step=len(STEPS), answers=answers)
                    return _finish(settings, user)
                return (f'Couldn\'t log in to that mailbox ({result.get("message")}) — '
                        'try again with the address and APP password '
                        '(hello@yourdomain.com:apppassword), or say "skip".')
            return ('I need both the address and the password together, like '
                    'hello@yourdomain.com:apppassword — or say "skip".')
        answers['email'] = 'skipped'
        _save_state(user, step=len(STEPS), answers=answers)
        return _finish(settings, user)

    # unreachable guard
    _save_state(user, done=True)
    return _finish(settings, user)
