from django.db import migrations
import re

# Kept in step with core.icp.NEVER_SEARCH_INDUSTRIES on purpose: a "who to
# find" made only of businesses like the seller's own is no list at all.
# A migration is frozen in time, so it carries its own copy.
PEER_TERMS = re.compile(
    r'web\s*design|web\s*development|digital marketing|marketing agency|seo agency|'
    r'software house|software development|app development|it consulting|it services|'
    r'web hosting|branding agency|creative agency|advertising agency|saas|crm|'
    r'social media agency|web agency|tech agency|ui\s*[/ ]?\s*ux|graphic design agency',
    re.I)


def _has_proper_data(row):
    """The rule of core.lead_gate as it was introduced: company name,
    something it sells and who to find ("partner agencies" is a choice)."""
    if not (row.company_name or '').strip():
        return False
    if not any(str(service).strip() for service in (row.services or [])):
        return False
    if (row.icp_mode or 'buyer') == 'agency':
        return True
    kinds = [k.strip() for k in re.split(r'[,\n]', row.target_industries or '') if k.strip()]
    return any(not PEER_TERMS.search(kind) for kind in kinds)


def autopilot_needs_proper_data(apps, schema_editor):
    """Autopilot is a way of fetching leads: a workspace saved with it on but
    without proper data is switched off once, so from here on "autopilot on"
    always means "may find leads" (core.lead_gate). Nothing else is touched."""
    AppSettings = apps.get_model('core', 'AppSettings')
    incomplete = [row.pk for row in AppSettings.objects.filter(runs_enabled=True)
                  if not _has_proper_data(row)]
    if incomplete:
        AppSettings.objects.filter(pk__in=incomplete).update(runs_enabled=False)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0044_responder_is_the_assistant'),
    ]

    operations = [
        migrations.RunPython(autopilot_needs_proper_data, migrations.RunPython.noop),
    ]
