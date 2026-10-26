"""
Standalone CRM backup + clean — one-off operations tool (salem_discovery.py
pattern: calls django.setup() itself, runs anywhere the app code lives).

    python backup_crm.py             # export only
    python backup_crm.py --wipe      # export, then delete everything exported
    python backup_crm.py --out DIR   # where to write (default ./backups)

Exports every CRM row (leads, email drafts, potentials, replies, pipeline
runs) to a timestamped JSON file plus a human-readable leads CSV.  --wipe
then deletes those rows for a clean slate.

What --wipe keeps on purpose:
  · ChatMessage        — the operator's own responder conversations
  · AppSettings        — keys, SMTP, targeting (search profiles manage that)
  · users / auth tokens
and what it additionally clears:
  · AppSettings.rejected_domains — the strict fake-data/competitor memory.
    Those domains were rejected under the OLD buyer-mode rules, where peer
    agencies were competitors; in agency-partner mode they are targets and
    must become discoverable again.
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'agentic.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from core.models import AppSettings, ChatMessage, EmailDraft, Lead, PipelineRun, Potential, Reply  # noqa: E402


def dump():
    now = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    settings = AppSettings.load()
    payload = {
        'meta': {
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'counts': {},
            'targeting': {
                'countries': settings.target_countries,
                'industries': settings.target_industries,
                'cities': settings.target_cities,
                'icp_mode': getattr(settings, 'icp_mode', ''),
            },
            'rejected_domains': settings.rejected_domains or [],
        },
        'leads': list(Lead.objects.values()),
        'email_drafts': list(EmailDraft.objects.values()),
        'potentials': list(Potential.objects.values()),
        'replies': list(Reply.objects.values()),
        'pipeline_runs': list(PipelineRun.objects.values()),
        'chat_messages': list(ChatMessage.objects.values()),
    }
    counts = {k: len(payload[k]) for k in
              ('leads', 'email_drafts', 'potentials', 'replies', 'pipeline_runs', 'chat_messages')}
    payload['meta']['counts'] = counts
    return now, payload


def write_outputs(out_dir, now, payload):
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, f'crm-backup-{now}.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, default=str, ensure_ascii=False)

    csv_path = os.path.join(out_dir, f'leads-{now}.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Company', 'Industry', 'Website', 'Country', 'State', 'Score',
                         'Contact email', 'Contact phone', 'Has website', 'AI description',
                         'Source', 'Discovered'])
        for l in payload['leads']:
            writer.writerow([
                l['company'], l['industry'], l['website'], l['country'], l['state'],
                l['score'], l['contact_email'], l['contact_phone'],
                'yes' if l['has_website'] else 'no',
                (l['description'] or '').replace('\n', ' '), l['source'],
                l['created_at'],
            ])
    return json_path, csv_path


def wipe():
    from django.db import transaction
    with transaction.atomic():
        deleted = {}
        for model in (EmailDraft, Potential, Reply, Lead, PipelineRun):
            deleted[model.__name__] = model.objects.count()
            model.objects.all().delete()
        settings = AppSettings.load()
        settings.rejected_domains = []
        settings.save(update_fields=['rejected_domains'])
    return deleted


def main():
    parser = argparse.ArgumentParser(description='CRM backup (and optional wipe)')
    parser.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backups'))
    parser.add_argument('--wipe', action='store_true', help='delete CRM rows after the export')
    args = parser.parse_args()

    now, payload = dump()
    json_path, csv_path = write_outputs(args.out, now, payload)
    counts = payload['meta']['counts']
    print(f'backup written: {json_path}')
    print(f'leads CSV:      {csv_path}')
    print('exported:', json.dumps(counts))

    if args.wipe:
        deleted = wipe()
        print('wiped:', json.dumps(deleted), '+ rejected_domains memory cleared')
        remaining = {'leads': Lead.objects.count(), 'drafts': EmailDraft.objects.count(),
                     'potentials': Potential.objects.count(), 'replies': Reply.objects.count(),
                     'pipeline_runs': PipelineRun.objects.count()}
        print('remaining:', json.dumps(remaining))


if __name__ == '__main__':
    main()
