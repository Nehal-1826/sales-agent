"""The 20:00 IST daily report looks after itself when the worker was down at
20:00 (a deploy, a crash): the round that was missed is sent the moment the
report loop starts again — once, and only the most recent one. And a round
covers everything since the previous one (not "all time", and not a calendar
day that would leave the evening out of every report).

Nothing is sent for real here: the command's sending is replaced."""

from datetime import date, datetime
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.models import Lead, ReportRound
from core.reports import (
    IST,
    build_daily_report,
    last_report_round,
    missed_report_round,
    note_report_round,
    report_window_ist,
)
from core.management.commands.daily_report import Command
from core.tests.base import TenantTestCase

MODULE = 'core.management.commands.daily_report'
TODAY = date(2026, 11, 25)
THE_ROUND = (datetime(2026, 11, 24, 20, tzinfo=IST), datetime(2026, 11, 25, 20, tzinfo=IST))   # 24 h up to 25 Nov 20:00


def at(day, hour, minute=0, second=0):
    """A moment in IST (November 2026)."""
    return datetime(2026, 11, day, hour, minute, second, tzinfo=IST)


class StopLoop(Exception):
    """Raised by the replaced sleep to end the endless loop."""


class MissedRoundTests(TestCase):
    def test_no_record_after_eight_is_todays_round(self):
        self.assertEqual(missed_report_round(at(25, 20, 5)), TODAY)

    def test_no_record_in_the_morning_is_nothing(self):
        # a first start, or the upgrade from before records existed: an old
        # report a day late is noise, so only a 20:00 that passed TODAY counts
        self.assertIsNone(missed_report_round(at(25, 10)))
        self.assertIsNone(missed_report_round(at(25, 19, 59)))

    def test_a_record_for_today_means_nothing_is_missed(self):
        note_report_round(TODAY)
        self.assertIsNone(missed_report_round(at(25, 20, 5)))
        self.assertIsNone(missed_report_round(at(25, 23, 30)))

    def test_down_across_midnight_the_evenings_round_is_still_missed(self):
        note_report_round(date(2026, 11, 23))
        self.assertEqual(missed_report_round(at(26, 0, 30)), date(2026, 11, 25))

    def test_a_quiet_morning_after_yesterdays_round_sends_nothing(self):
        note_report_round(date(2026, 11, 24))
        self.assertIsNone(missed_report_round(at(25, 10)))

    def test_only_the_most_recent_missed_round_counts(self):
        note_report_round(date(2026, 11, 20))
        self.assertEqual(missed_report_round(at(25, 20, 5)), TODAY)

    def test_a_record_from_the_future_is_not_behind(self):
        note_report_round(date(2026, 11, 26))        # a clock that was wrong
        self.assertIsNone(missed_report_round(at(25, 20, 5)))

    def test_recording_a_day_twice_changes_nothing(self):
        note_report_round(TODAY)
        note_report_round(TODAY)
        self.assertEqual((ReportRound.objects.count(), last_report_round()), (1, TODAY))


class LoopTests(TenantTestCase):
    """Drives `daily_report --loop` for a bounded number of ticks on a fake clock."""

    def run_loop(self, now, on_sleep):
        """on_sleep(clock) is called for every sleep of the loop; it moves the
        clock or raises StopLoop."""
        clock = {'now': now}
        out = StringIO()

        def fake_sleep(_seconds):
            on_sleep(clock)
        with mock.patch.object(Command, '_send_all') as send, \
                mock.patch(f'{MODULE}.now_ist', side_effect=lambda: clock['now']), \
                mock.patch('core.reports.now_ist', side_effect=lambda: clock['now']), \
                mock.patch(f'{MODULE}.time.sleep', side_effect=fake_sleep), \
                mock.patch(f'{MODULE}.beat'):
            with self.assertRaises(StopLoop):
                call_command('daily_report', '--loop', stdout=out)
        return send, out.getvalue()

    def test_a_worker_back_after_a_missed_eight_sends_that_round_at_once(self):
        send, out = self.run_loop(at(25, 20, 9), lambda clock: (_ for _ in ()).throw(StopLoop()))
        self.assertEqual(send.call_count, 1)
        self.assertEqual(last_report_round(), TODAY)          # …and remembers it
        self.assertIn('could not go out', out)
        self.assertEqual(send.call_args.kwargs['window'], THE_ROUND)   # …with everything since the day before

    def test_a_first_start_in_the_morning_sends_nothing(self):
        send, _ = self.run_loop(at(25, 10), lambda clock: (_ for _ in ()).throw(StopLoop()))
        send.assert_not_called()
        self.assertIsNone(last_report_round())

    def test_after_three_days_down_it_covers_everything_since_the_last_report(self):
        # not only the last day: the older two must not vanish from the reports
        note_report_round(date(2026, 11, 22))
        send, _ = self.run_loop(at(25, 20, 9), lambda clock: (_ for _ in ()).throw(StopLoop()))
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs['window'],
                         (datetime(2026, 11, 22, 20, tzinfo=IST), datetime(2026, 11, 25, 20, tzinfo=IST)))

    def test_the_scheduled_round_is_sent_once_and_remembered(self):
        # 19:59:59: the loop waits; the clock passes 20:00; the round runs; the loop waits again (stop)
        steps = [lambda clock: clock.__setitem__('now', at(25, 20, 0, 1)),
                 lambda clock: (_ for _ in ()).throw(StopLoop())]
        send, out = self.run_loop(at(25, 19, 59, 59), lambda clock: steps.pop(0)(clock))
        self.assertEqual(send.call_count, 1)
        self.assertEqual(last_report_round(), TODAY)
        self.assertIn('Next report at 26 Nov 2026 20:00', out)
        self.assertEqual(send.call_args.kwargs['window'], THE_ROUND)   # the 24 hours up to this 20:00

    def test_a_restart_the_same_evening_does_not_send_it_twice(self):
        note_report_round(TODAY)
        send, out = self.run_loop(at(25, 20, 30), lambda clock: (_ for _ in ()).throw(StopLoop()))
        send.assert_not_called()
        self.assertNotIn('could not go out', out)


class SingleShotTests(TenantTestCase):
    def send_now(self, now, *args):
        with mock.patch(f'{MODULE}.send_daily_report', return_value=('console', 's')), \
                mock.patch(f'{MODULE}.now_ist', return_value=now):
            call_command('daily_report', *args, stdout=StringIO())

    def test_a_full_round_sent_by_hand_after_eight_counts_as_the_days_round(self):
        self.send_now(at(25, 20, 30))
        self.assertEqual(last_report_round(), TODAY)
        self.assertIsNone(missed_report_round(at(25, 21)))        # so a restart must not send it twice

    def test_one_sent_in_the_afternoon_does_not_count(self):
        self.send_now(at(25, 15))
        self.assertIsNone(last_report_round())                    # the 20:00 round is still to come

    def test_one_for_a_single_day_or_a_single_workspace_does_not_count(self):
        self.send_now(at(25, 20, 30), '--day', '2026-10-01')
        self.send_now(at(25, 20, 31), '--workspace', self.workspace.slug)
        self.assertIsNone(last_report_round())


class WindowTests(TenantTestCase):
    """What a 20:00 round covers: everything since the previous report."""

    def lead(self, company, when):
        row = Lead.objects.create(company=company, website=f'{company.lower()}.test', industry='x')
        Lead.objects.filter(pk=row.pk).update(created_at=when)     # auto_now_add: set with a plain UPDATE
        return row

    def body(self, **scope):
        return build_daily_report(**scope)[1]

    def test_a_round_is_the_24_hours_up_to_its_eight(self):
        self.assertEqual(report_window_ist(TODAY), THE_ROUND)

    def test_it_reaches_back_to_the_previous_round(self):
        self.assertEqual(report_window_ist(TODAY, since=datetime(2026, 11, 22, 20, tzinfo=IST)),
                         (datetime(2026, 11, 22, 20, tzinfo=IST), datetime(2026, 11, 25, 20, tzinfo=IST)))

    def test_a_previous_round_that_is_not_before_is_ignored(self):
        # a wrong clock must not give an empty or backwards window
        self.assertEqual(report_window_ist(TODAY, since=datetime(2026, 11, 26, 20, tzinfo=IST)), THE_ROUND)

    def test_a_lead_found_after_eight_in_the_evening_is_in_the_next_report(self):
        # a calendar day would leave it out of every report: today's went out at 20:00, tomorrow's starts at midnight
        self.lead('Evening', at(25, 21, 15))
        self.assertNotIn('Evening', self.body(window=report_window_ist(TODAY)))                  # not yet
        self.assertIn('Evening', self.body(window=report_window_ist(date(2026, 11, 26))))      # in the next one

    def test_it_ends_where_it_says(self):
        self.lead('OnTheLine', at(25, 20, 0))                    # belongs to the next round
        self.lead('Before', at(25, 19, 59, 59))
        body = self.body(window=report_window_ist(TODAY))
        self.assertNotIn('OnTheLine', body)
        self.assertIn('Before', body)

    def test_the_title_says_what_is_covered(self):
        subject, body = build_daily_report(window=report_window_ist(TODAY))
        self.assertTrue(subject.endswith('Lead report — 24 Nov 20:00 – 25 Nov 20:00 IST'), subject)
        self.assertEqual(body.splitlines()[0], 'Lead report — 24 Nov 20:00 – 25 Nov 20:00 IST')

    def test_a_longer_catch_up_says_so(self):
        window = report_window_ist(TODAY, since=datetime(2026, 11, 22, 20, tzinfo=IST))
        self.assertIn('22 Nov 20:00 – 25 Nov 20:00 IST', self.body(window=window).splitlines()[0])

    def test_a_quiet_day_says_so(self):
        body = self.body(window=report_window_ist(TODAY))
        self.assertIn('LEADS FOUND: 0', body)

    def test_a_calendar_day_report_is_unchanged(self):
        self.lead('Evening', at(25, 21, 15))
        # it sits in the calendar day it was found — whose 20:00 report already
        # went out — and in no later day: the gap the 20:00 window closes
        self.assertIn('Evening', self.body(day=TODAY))
        self.assertNotIn('Evening', self.body(day=date(2026, 11, 26)))
        self.assertIn('Lead report — 25 Nov 2026 (IST)', self.body(day=TODAY))
        self.assertIn('LEADS SCRAPED TODAY: 1', self.body(day=TODAY))

    def test_an_all_time_report_is_unchanged(self):
        self.lead('Evening', at(25, 21, 15))
        body = self.body()
        self.assertIn('Evening', body)
        self.assertIn('Lead report — all time', body)
        self.assertIn('LEADS IN CRM: 1', body)
