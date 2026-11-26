"""Indian formats for the warmup service's documents (app.services.formatting):
its invoice PDF, mails and reports always read the same for everyone —
lakhs and crores, day-first dates, 12-hour times, Indian time."""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.services import formatting


def at(hour: int, minute: int = 0, day: int = 26) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def test_lakhs_and_crores() -> None:
    assert [formatting.number(n) for n in (999, 1000, 99999, 100000, 1234567, 10000000)] == [
        "999", "1,000", "99,999", "1,00,000", "12,34,567", "1,00,00,000"]


def test_minor_units() -> None:
    assert formatting.money(49900, "INR") == "₹499.00"
    assert formatting.money(3900, "USD") == "$39.00"
    assert formatting.money(-500, "INR") == "-₹5.00"


def test_whole_units_rounded_the_way_money_is() -> None:
    assert formatting.money_major(499.0, "INR", 0) == "₹499"
    assert formatting.money_major(1234.0, "INR") == "₹1,234.00"
    assert formatting.money_major(150000.5, "INR", 0) == "₹1,50,001"       # half-up, not half-to-even
    assert formatting.money_major(1234567.891, "INR") == "₹12,34,567.89"


def test_day_first_in_indian_time() -> None:
    assert formatting.date(at(10, 30)) == "26/11/2026"
    assert formatting.date(at(18, 30)) == "27/11/2026"                       # midnight has passed in India
    assert formatting.date(date(2026, 11, 5)) == "05/11/2026"                # a plain day
    assert formatting.date(datetime(2026, 11, 5)) == "05/11/2026"            # naive: taken as UTC


def test_dates_and_times() -> None:
    assert formatting.datetime_label(at(8, 35)) == "26/11/2026, 2:05 PM IST"
    assert formatting.datetime_label(at(18, 30)) == "27/11/2026, 12:00 AM IST"


def test_nothing_is_nothing() -> None:
    assert (formatting.date(None), formatting.datetime_label(None)) == ("", "")
