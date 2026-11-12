"""Background scheduler thread — sends the daily lead report at 20:00 IST.

Started automatically with the Django dev server (CoreConfig.ready, guarded
by RUN_MAIN so the autoreloader's parent process doesn't double-start).
Waits in short slices; catches up if the server was started after 8 PM.
The same job can run standalone via `python manage.py daily_report --loop`.
"""

import threading

from django.core.management import call_command

_started = False


def _run_forever():
    while True:
        try:
            call_command('daily_report', '--loop')
        except Exception as exc:  # never let the thread die
            import logging
            logging.getLogger(__name__).warning('Report loop crashed, restarting: %s', exc)
            threading.Event().wait(300)


def start_report_scheduler():
    """Idempotent — starts the daemon thread once per process."""
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_run_forever, name='daily-report-scheduler',
                     daemon=True).start()
