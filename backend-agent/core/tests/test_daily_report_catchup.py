"""The 20:00 IST daily report looks after itself when the worker was down at
20:00 (a deploy, a crash): the round that was missed is sent the moment the
report loop starts again — once, and only the most recent one.

Nothing is sent for real here: the command's sending is replaced."""

from datetime import date, datetime
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.models import ReportRound
from core.reports import IST, last_report_round, missed_report_round, note_report_round
from core.management.commands.daily_report import Command
from core.tests.base import TenantTestCase

MODULE = 'core.management.commands.daily_report'
TODAY = date(2026, 11, 25)


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

    def test_a_first_start_in_the_morning_sends_nothing(self):
        send, _ = self.run_loop(at(25, 10), lambda clock: (_ for _ in ()).throw(StopLoop()))
        send.assert_not_called()
        self.assertIsNone(last_report_round())

    def test_the_scheduled_round_is_sent_once_and_remembered(self):
        # 19:59:59: the loop waits; the clock passes 20:00; the round runs; the loop waits again (stop)
        steps = [lambda clock: clock.__setitem__('now', at(25, 20, 0, 1)),
                 lambda clock: (_ for _ in ()).throw(StopLoop())]
        send, out = self.run_loop(at(25, 19, 59, 59), lambda clock: steps.pop(0)(clock))
        self.assertEqual(send.call_count, 1)
        self.assertEqual(last_report_round(), TODAY)
        self.assertIn('Next report at 26 Nov 2026 20:00', out)

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
