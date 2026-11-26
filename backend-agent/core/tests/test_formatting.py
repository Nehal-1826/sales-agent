"""Indian formats for documents (core.formatting): lakhs and crores, day-first
dates, 12-hour times, Indian time — the same for everyone who reads them.
Portable code only: these tests run on Windows too."""

from datetime import date, datetime, timezone

from django.test import SimpleTestCase

from core import formatting


def at(hour, minute=0, day=26):
    return datetime(2026, 11, day, hour, minute, tzinfo=timezone.utc)


class NumberTests(SimpleTestCase):
    def test_lakhs_and_crores(self):
        self.assertEqual([formatting.number(n) for n in (0, 999, 1000, 9999, 99999, 100000, 1234567, 10000000)],
                         ['0', '999', '1,000', '9,999', '99,999', '1,00,000', '12,34,567', '1,00,00,000'])

    def test_decimals_and_negatives(self):
        self.assertEqual(formatting.number(1234.5), '1,234.5')
        self.assertEqual(formatting.number(-150000), '-1,50,000')


class MoneyTests(SimpleTestCase):
    def test_rupees_with_indian_grouping(self):
        self.assertEqual(formatting.money(299900, 'INR'), '₹2,999.00')
        self.assertEqual(formatting.money(10000000, 'INR'), '₹1,00,000.00')
        self.assertEqual(formatting.money(0, 'INR'), '₹0.00')

    def test_other_currencies_keep_their_sign(self):
        self.assertEqual(formatting.money(3900, 'USD'), '$39.00')
        self.assertEqual(formatting.money(-500, 'INR'), '-₹5.00')
        self.assertEqual(formatting.money(49900, 'EUR'), 'EUR 499.00')

    def test_whole_units(self):
        self.assertEqual(formatting.money_major(499.0, 'INR', 0), '₹499')
        self.assertEqual(formatting.money_major(1234.0, 'INR'), '₹1,234.00')
        self.assertEqual(formatting.money_major(150000.5, 'INR', 0), '₹1,50,001')


class DateTests(SimpleTestCase):
    def test_day_first_in_indian_time(self):
        self.assertEqual(formatting.date(at(10, 30)), '26/11/2026')
        self.assertEqual(formatting.date(at(18, 30)), '27/11/2026')          # midnight has passed in India
        self.assertEqual(formatting.date(at(5, day=5)), '05/11/2026')

    def test_a_date_object_and_a_naive_time(self):
        self.assertEqual(formatting.date(date(2026, 11, 5)), '05/11/2026')            # a plain day, as the daily report gets
        self.assertEqual(formatting.date(datetime(2026, 11, 5)), '05/11/2026')         # naive: taken as UTC (05:30 in India)

    def test_dates_and_times(self):
        # India is 5½ hours ahead of UTC: 08:35 UTC is 2:05 PM, 18:30 UTC is midnight there
        self.assertEqual(formatting.datetime_label(at(8, 35)), '26/11/2026, 2:05 PM IST')
        self.assertEqual(formatting.datetime_label(at(14, 5)), '26/11/2026, 7:35 PM IST')
        self.assertEqual(formatting.datetime_label(at(0, 5)), '26/11/2026, 5:35 AM IST')
        self.assertEqual(formatting.datetime_label(at(18, 30)), '27/11/2026, 12:00 AM IST')

    def test_short_forms(self):
        self.assertEqual(formatting.day_month(at(10)), '26/11')
        self.assertEqual(formatting.clock(at(8, 35)), '2:05 PM')
        self.assertEqual(formatting.clock(at(0, 5)), '5:35 AM')
        self.assertEqual(formatting.clock(at(6, 30)), '12:00 PM')            # noon in India
        self.assertEqual(formatting.clock(at(18, 30)), '12:00 AM')          # midnight in India

    def test_nothing_is_nothing(self):
        self.assertEqual((formatting.date(None), formatting.datetime_label(None), formatting.clock(None),
                          formatting.day_month(None)), ('', '', '', ''))
