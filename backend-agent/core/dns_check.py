"""Sending-domain DNS health — SPF, DKIM, DMARC, MX — for one mailbox.

check_domain() never raises: every lookup has a short timeout and any error
becomes a "not found" result with a plain-language fix hint, so the Settings
page can always render a checklist.  Results are stored on Mailbox.dns."""

import logging

from django.utils import timezone

log = logging.getLogger(__name__)

LOOKUP_TIMEOUT = 3.0  # seconds per query
DKIM_SELECTORS = ('google', 'selector1', 'selector2', 'zoho', 'zmail', 'default', 'k1', 'mail')

FIX_HINTS = {
    'spf': ('Add a TXT record on your domain starting with "v=spf1" that includes your email '
            'provider (for example "include:_spf.google.com" for Google Workspace or '
            '"include:zoho.in" for Zoho). Your domain registrar or email provider has a guide.'),
    'dkim': ('Turn on DKIM signing in your email provider\'s admin panel and add the TXT record '
             'it gives you. Without it, inboxes trust your emails less.'),
    'dmarc': ('Add a TXT record named "_dmarc" with a value like '
              '"v=DMARC1; p=none; rua=mailto:you@yourdomain.com". Start with p=none, then '
              'tighten to quarantine once everything passes.'),
    'mx': ('Your domain has no mail (MX) records, so replies cannot reach you. Add the MX '
           'records your email provider lists.'),
}


def _txt(resolver, name):
    """All TXT strings at name ([] on any failure)."""
    try:
        answer = resolver.resolve(name, 'TXT', lifetime=LOOKUP_TIMEOUT)
    except Exception:
        return []
    out = []
    for rdata in answer:
        try:
            out.append(b''.join(rdata.strings).decode('utf-8', 'replace'))
        except Exception:
            out.append(str(rdata).strip('"'))
    return out


def _resolver():
    import dns.resolver
    r = dns.resolver.Resolver()
    r.timeout = LOOKUP_TIMEOUT
    r.lifetime = LOOKUP_TIMEOUT
    return r


def check_spf(resolver, domain):
    records = [t for t in _txt(resolver, domain) if t.lower().startswith('v=spf1')]
    if not records:
        return {'ok': False, 'record': '', 'hint': FIX_HINTS['spf']}
    rec = records[0]
    low = rec.lower()
    # plausible = it authorises someone: include:, a, mx, ip4/ip6, redirect=
    plausible = any(tok in low for tok in ('include:', ' a', ' mx', 'ip4:', 'ip6:', 'redirect='))
    result = {'ok': plausible and len(records) == 1, 'record': rec[:300], 'hint': ''}
    if len(records) > 1:
        result['hint'] = 'Your domain has more than one SPF record — merge them into one.'
    elif not plausible:
        result['hint'] = FIX_HINTS['spf']
    return result


def check_dmarc(resolver, domain):
    records = [t for t in _txt(resolver, f'_dmarc.{domain}') if t.lower().startswith('v=dmarc1')]
    if not records:
        return {'ok': False, 'record': '', 'policy': '', 'hint': FIX_HINTS['dmarc']}
    rec = records[0]
    policy = ''
    for part in rec.split(';'):
        key, _, value = part.strip().partition('=')
        if key.strip().lower() == 'p':
            policy = value.strip().lower()
    return {'ok': bool(policy), 'record': rec[:300], 'policy': policy,
            'hint': '' if policy else FIX_HINTS['dmarc']}


def check_dkim(resolver, domain):
    found = [sel for sel in DKIM_SELECTORS
             if any('p=' in t.lower() or 'v=dkim1' in t.lower()
                    for t in _txt(resolver, f'{sel}._domainkey.{domain}'))]
    return {'ok': bool(found), 'selectors': found,
            'hint': '' if found else FIX_HINTS['dkim'] + (
                ' (We checked the common selectors; a custom one may still exist.)')}


def check_mx(resolver, domain):
    try:
        answer = resolver.resolve(domain, 'MX', lifetime=LOOKUP_TIMEOUT)
        hosts = sorted(str(r.exchange).rstrip('.') for r in answer)
    except Exception:
        hosts = []
    return {'ok': bool(hosts), 'hosts': hosts[:5], 'hint': '' if hosts else FIX_HINTS['mx']}


def check_domain(domain):
    """{domain, spf, dkim, dmarc, mx, error?} — never raises."""
    domain = (domain or '').strip().lower().rstrip('.')
    empty = {k: {'ok': False, 'hint': FIX_HINTS[k]} for k in ('spf', 'dkim', 'dmarc', 'mx')}
    if not domain or '.' not in domain:
        return {'domain': domain, **empty, 'error': 'No valid domain to check.'}
    try:
        resolver = _resolver()
    except Exception as exc:  # dnspython missing / no resolver config
        log.warning('DNS check unavailable: %s', exc)
        return {'domain': domain, **empty, 'error': 'DNS lookups are unavailable on this server.'}
    out = {'domain': domain}
    for key, fn in (('spf', check_spf), ('dkim', check_dkim), ('dmarc', check_dmarc), ('mx', check_mx)):
        try:
            out[key] = fn(resolver, domain)
        except Exception as exc:  # belt and braces — the checks already swallow errors
            log.warning('DNS %s check failed for %s: %s', key, domain, exc)
            out[key] = {'ok': False, 'hint': FIX_HINTS[key]}
    return out


def refresh_mailbox_dns(mailbox):
    """Run the checks for one mailbox and store them.  Returns the result."""
    result = check_domain(mailbox.domain)
    mailbox.dns = result
    mailbox.dns_checked_at = timezone.now()
    mailbox.save(update_fields=['dns', 'dns_checked_at', 'updated_at'])
    return result
