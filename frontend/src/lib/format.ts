/**
 * The ONE place that formats a date, a time, a number or an amount on a
 * screen — and holds the person's choice of how those read.
 *
 * India is the default for everyone (26/11/2026, 1,00,000, 2:05 PM). A person
 * can switch to the United States, the UK or "match my device", and between
 * the 12- and the 24-hour clock (components/FormatCard: Settings, or the
 * sidebar — both apps, every role). The choice is saved on the account
 * (User.format / User.clock) and arrives with the profile; the app waits for
 * the profile before it draws the first screen, so there is no flash.
 *
 * Documents — invoices, report e-mails — are always Indian and are written by
 * the server (core/formatting.py). Nothing else in the app may call
 * `toLocaleDateString`, `toLocaleString`, `toLocaleTimeString`,
 * `new Intl.NumberFormat` or `new Intl.DateTimeFormat`: the browser gate
 * looks for it.
 */
import { useSyncExternalStore } from 'react';

export type FormatPreset = 'IN' | 'US' | 'GB' | 'device';
export type Clock = '12h' | '24h';
export interface Preferences {
  format: FormatPreset;
  clock: Clock;
}

export const FORMAT_LABELS: Record<FormatPreset, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'UK',
  device: 'Match my device',
};
export const CLOCK_LABELS: Record<Clock, string> = {
  '12h': '12-hour (2:05 PM)',
  '24h': '24-hour (14:05)',
};
export const DEFAULT_PREFERENCES: Preferences = { format: 'IN', clock: '12h' };

/* ------------------------------------------------------------------ */
/* The person's choice                                                 */
/* ------------------------------------------------------------------ */

let current: Preferences = DEFAULT_PREFERENCES;
const listeners = new Set<() => void>();

function isPreset(value: unknown): value is FormatPreset {
  return value === 'IN' || value === 'US' || value === 'GB' || value === 'device';
}

export function getPreferences(): Preferences {
  return current;
}

/** Follow the person's choice, and tell every screen that shows a date or a number. */
export function setPreferences(next: Partial<Preferences> | null | undefined): void {
  const format = isPreset(next?.format) ? next.format : current.format;
  const clock = next?.clock === '12h' || next?.clock === '24h' ? next.clock : current.clock;
  if (format === current.format && clock === current.clock) return;
  current = { format, clock };
  listeners.forEach((tell) => tell());
}

function subscribe(tell: () => void): () => void {
  listeners.add(tell);
  return () => {
    listeners.delete(tell);
  };
}

/** The person's choice; the screen that asked draws again when it changes. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences, getPreferences);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Which locale each format reads through; `undefined` is the browser's own. */
const LOCALES: Record<FormatPreset, string | undefined> = { IN: 'en-IN', US: 'en-US', GB: 'en-GB', device: undefined };
/** The sign of a money amount follows the money; only its grouping follows the format. */
const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$' };

export type When = Date | string | number | null | undefined;

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BARE_MONTH = /^\d{4}-\d{2}$/;

/** The moment a value names, or null when it names none. A bare day
 *  ("2026-11-26") or month ("2026-11") is a calendar label, not an instant:
 *  `new Date` would read it as midnight in UTC, which is still the day before
 *  on any device west of Greenwich — so it is read as that day where the
 *  person is. */
export function toDate(when: When): Date | null {
  if (when === null || when === undefined || when === '') return null;
  let d: Date;
  if (typeof when === 'string' && BARE_DAY.test(when)) {
    d = new Date(Number(when.slice(0, 4)), Number(when.slice(5, 7)) - 1, Number(when.slice(8, 10)));
  } else if (typeof when === 'string' && BARE_MONTH.test(when)) {
    d = new Date(Number(when.slice(0, 4)), Number(when.slice(5, 7)) - 1, 1);
  } else {
    d = when instanceof Date ? when : new Date(when);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

function style(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALES[current.format], { ...options, hour12: current.clock === '12h' });
}

/** India and the UK write "2:05 pm" in small letters; the choice is "2:05 PM" everywhere. */
function capitals(text: string): string {
  return text.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/** 26/11/2026 (India, UK) or 11/26/2026 (US); medium: 26 Nov 2026 or Nov 26, 2026. */
export function fmtDate(when: When, kind: 'short' | 'medium' = 'short'): string {
  const d = toDate(when);
  if (!d) return '';
  return style(
    kind === 'short'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(d);
}

/** 2:05 PM or 14:05 — a time of day, in the device's time zone. The 24-hour
 *  clock always writes the leading zero (09:04) in every format; the 12-hour
 *  one never does (9:04 AM). */
export function fmtTime(when: When): string {
  const d = toDate(when);
  if (!d) return '';
  return capitals(style({ hour: current.clock === '24h' ? '2-digit' : 'numeric', minute: '2-digit' }).format(d));
}

/** 26/11/2026, 2:05 PM */
export function fmtDateTime(when: When, kind: 'short' | 'medium' = 'short'): string {
  const d = toDate(when);
  return d ? `${fmtDate(d, kind)}, ${fmtTime(d)}` : '';
}

/** A chart-axis day: 26 Nov or Nov 26 (with the year: 26 Nov 2026). */
export function fmtDayTick(when: When, withYear = false): string {
  const d = toDate(when);
  if (!d) return '';
  return style(withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).format(d);
}

/** A month on its own — Nov 2026 — from a month key ("2026-11") or any date. */
export function fmtMonth(when: When): string {
  const d = toDate(when);
  return d ? style({ month: 'short', year: 'numeric' }).format(d) : '';
}

/** 1,00,000 in India, 100,000 elsewhere; `digits` fixes the decimals. */
export function fmtNumber(n: number | null | undefined, digits?: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const options: Intl.NumberFormatOptions = {};
  if (digits !== undefined) {
    options.minimumFractionDigits = digits;
    options.maximumFractionDigits = digits;
  }
  return new Intl.NumberFormat(LOCALES[current.format], options).format(n);
}

function amount(value: number, currency: string, digits: number, divisor: number): string {
  const sign = value < 0 ? '-' : '';
  const text = new Intl.NumberFormat(LOCALES[current.format], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value) / divisor);
  return `${sign}${SYMBOLS[currency] ?? `${currency} `}${text}`;
}

/** An amount in minor units (paise, cents): ₹2,999.00, $39.00. */
export function fmtMoney(minor: number | null | undefined, currency: string, digits = 2): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '';
  return amount(minor, currency, digits, 100);
}

/** An amount in whole units (rupees, dollars): $39.00, ₹499. */
export function fmtMoneyMajor(major: number | null | undefined, currency: string, digits = 2): string {
  if (major === null || major === undefined || !Number.isFinite(major)) return '';
  return amount(major, currency, digits, 1);
}

/** 72% or 72.4% */
export function fmtPercent(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '' : `${fmtNumber(n, digits)}%`;
}

const SAMPLE = new Date(2026, 10, 26, 14, 5);      // 26 Nov 2026, five past two in the afternoon

/** What a date, a time, a number and an amount look like under `prefs` — the
 *  Format card shows it while the person is still choosing. */
export function preview(prefs: Preferences): string {
  const before = current;
  current = { format: isPreset(prefs.format) ? prefs.format : 'IN', clock: prefs.clock === '24h' ? '24h' : '12h' };
  try {
    return `${fmtDateTime(SAMPLE)} · ${fmtNumber(100000)} · ${fmtMoneyMajor(2999, 'INR')}`;
  } finally {
    current = before;
  }
}

/* ------------------------------------------------------------------ */
/* Small display helpers shared by pages                               */
/* ------------------------------------------------------------------ */

/** "5 min ago", "3 days ago", "2 months ago" — how long before now. The count
 *  is small enough that it needs no grouping, and the words are plain ones. */
export function timeAgo(iso: When): string {
  const d = toDate(iso);
  if (!d) return '';
  const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** "2:05" since an ISO start time — a duration, not a time of day. */
export function elapsedClock(iso: When, now = Date.now()): string {
  const d = toDate(iso);
  if (!d) return '';
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "3 leads" — the count grouped the way the person reads numbers. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
