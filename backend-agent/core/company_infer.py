"""POST /api/company/infer — Settings → Fetch, step 2.

Step 1 (company_scrape) answers in a second or two with the page facts;
this one asks the LOCAL model what the company sells and who buys from it
(core.business_profile), which takes longer — the browser waits for it
apart.  It only answers: applying the result goes through the normal
Settings save, so nothing is written behind the user's back.
"""

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

from .business_profile import BadUrl, profile_from_domain
from .permissions import IsWorkspaceAdmin
from .throttles import CompanyInferThrottle


def profile_json(profile):
    """The profile dict in the shape the browser's types use."""
    return {
        'domain': profile['domain'],
        'name': profile['name'],
        'description': profile['description'],
        'address': profile['address'],
        'services': list(profile.get('services') or []),
        'customerType': profile.get('customer_type') or '',
        'targetIndustries': list(profile.get('target_industries') or []),
        'targetCountries': list(profile.get('target_countries') or []),
        'icpNotes': profile.get('icp_notes') or '',
        'inferred': bool(profile.get('inferred')),
    }


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
@throttle_classes([CompanyInferThrottle])
def company_infer(request):
    data = request.data if hasattr(request.data, 'get') else {}
    raw = data.get('url')
    if not isinstance(raw, str) or not raw.strip():
        return Response({'detail': 'Enter the website address.'}, status=422)
    try:
        profile = profile_from_domain(raw.strip())
    except BadUrl as exc:
        return Response({'detail': str(exc)}, status=422)
    return Response(profile_json(profile))
