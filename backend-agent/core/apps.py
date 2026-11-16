import os

from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        from .sequences import connect_signals
        connect_signals()  # follow-up stop rules (reply, unsubscribe, won/lost, do-not-contact)
        # Start the 8 PM IST daily-report scheduler with the dev server.
        # RUN_MAIN guards against the autoreloader's parent process double-start.
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('REPORT_SCHEDULER') == '1':
            from .scheduler import start_report_scheduler
            start_report_scheduler()
