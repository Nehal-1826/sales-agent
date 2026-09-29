#!/bin/sh
# Container entrypoint — prepares the DB then starts the API (gunicorn).
set -e

echo "[entrypoint] waiting for the database…"
python - <<'PY'
import os, time
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'agentic.settings')
django.setup()
from django.db import connection

for attempt in range(60):
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
        print('[entrypoint] database is up')
        break
    except Exception as exc:
        print(f'[entrypoint] db not ready ({exc.__class__.__name__}), retry {attempt + 1}/60')
        time.sleep(2)
else:
    raise SystemExit('[entrypoint] database never became ready')
PY

echo "[entrypoint] applying migrations…"
python manage.py migrate --noinput

echo "[entrypoint] collecting static files…"
python manage.py collectstatic --noinput

echo "[entrypoint] seeding demo data (skips if already seeded)…"
python manage.py seed_demo

if [ "$ROLE" = "worker" ]; then
    echo "[entrypoint] starting agent worker…"
    exec python manage.py run_worker
fi

echo "[entrypoint] starting gunicorn…"
exec gunicorn agentic.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 300 \
    --access-logfile - \
    --error-logfile -
