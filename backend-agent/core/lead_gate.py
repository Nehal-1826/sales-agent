"""The lead-finding gate: a workspace without proper data cannot fetch leads.

The owner found 726 leads that had nothing to do with the business
(veterinary clinics from Colombia, tattoo shops from India…) in a journal
publisher's workspace: the search had rotated a fixed list of somebody
else's customers for a workspace nobody had set up, and nothing stopped it.

"Proper data" is three SAVED things:

    company name   who is looking (every email is signed with it)
    what you sell  the words the search, the relevance check and every
                   email are built on - without them anything passes
    who to find    the kinds of businesses to look for; "partner agencies"
                   is a choice too, and a list made only of businesses like
                   the user's own is no list at all

Until all three exist every door that starts lead finding is shut - the
"Find leads now" button, the chat command, autopilot and the scheduler -
and the message says what is missing and where to add it. Nothing is
guessed here, not even by the model: the model's reading of a website is
saved into the settings first (Settings → Fetch, the setup wizard, "who
should I find?" in chat) and only what is saved counts.
"""

from .icp import buyer_industries
from .models import AppSettings

REQUIREMENTS = {
    'company_name': 'your company name',
    'services': 'what you sell',
    'who': 'who to find',
}


class LeadFetchNotReady(Exception):
    """A lead-finding run was asked for in a workspace without proper data.
    `missing` lists what is missing (keys of REQUIREMENTS); the message says
    so in plain words."""

    def __init__(self, missing):
        self.missing = list(missing)
        super().__init__(lead_fetch_message(self.missing))


def missing_lead_data(settings):
    """What the setup is still missing, in order — [] when lead finding may
    run. Reads the workspace's saved settings only."""
    missing = []
    if not (settings.company_name or '').strip():
        missing.append('company_name')
    if not any(str(service).strip() for service in (settings.services or [])):
        missing.append('services')
    if not buyer_industries(settings):
        missing.append('who')
    return missing


def _join(words):
    if len(words) < 2:
        return ''.join(words)
    return ', '.join(words[:-1]) + ' and ' + words[-1]


def lead_fetch_reason(missing):
    """Why lead finding is off, in plain words: what is missing and where to
    add it ('' when nothing is)."""
    if not missing:
        return ''
    what = _join([REQUIREMENTS[code] for code in missing if code in REQUIREMENTS])
    return (f'your setup is missing {what}. '
            'Add it in Settings (Your business and Who to find), or tell the Assistant '
            "— say \"who should I find?\" and it works it out from your website.")


def lead_fetch_message(missing):
    """What the person is told when they ask for leads: '' when nothing is
    missing."""
    return f"I can't find leads yet — {lead_fetch_reason(missing)}" if missing else ''


def autopilot_went_off_message(missing):
    """Said when a Settings save took the proper data away while autopilot
    was on: the save itself is never refused."""
    return f'Saved. Automatic searching is now off — {lead_fetch_reason(missing)}'


def lead_fetch_status(settings=None):
    """For the app: {'ready', 'missing', 'message'}."""
    missing = missing_lead_data(settings or AppSettings.load())
    return {'ready': not missing, 'missing': missing, 'message': lead_fetch_message(missing)}


def check_lead_fetch_ready():
    """Raise LeadFetchNotReady unless the current workspace has proper data.
    Called before anything starts (and before the run lock is taken)."""
    missing = missing_lead_data(AppSettings.load())
    if missing:
        raise LeadFetchNotReady(missing)
