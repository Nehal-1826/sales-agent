/**
 * Pure formatting helpers for money, numbers, dates, and times.
 *
 * Each function accepts an optional `region` parameter. When omitted the
 * value is read from `useLocaleStore.getState().region`, so non-component
 * code (Celery helpers, export utils, etc.) can call them without a React
 * context — they always pick up the user's persisted preference.
 *
 * Components should prefer `useLocaleFormat()` (from hooks/useLocaleFormat.ts)
 * which re-renders when the region changes.
 */

import { useLocaleStore } from '@/stores/locale';
import type { Region } from '@/stores/locale';

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Resolve region: explicit arg wins, otherwise read the persisted store. */
function resolveRegion(r: Region | undefined): Region {
  return r ?? useLocaleStore.getState().region;
}

/** Safely coerce date inputs; returns null for invalid/null/undefined. */
function toDate(date: string | number | Date | null | undefined): Date | null {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Money ────────────────────────────────────────────────────────────────

/**
 * Format a monetary amount.
 *
 * @example
 *   formatMoney(1234567)           // IN  → "₹12,34,567"
 *   formatMoney(1234567)           // INTL → "$1,234,567"
 *   formatMoney(1234.5, { decimals: 2 }) // IN → "₹1,234.50"
 */
export function formatMoney(
  amount: number,
  opts?: { region?: Region; decimals?: number },
): string {
  const region = resolveRegion(opts?.region);
  const decimals = opts?.decimals ?? 0;

  if (region === 'IN') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

// ─── Numbers ──────────────────────────────────────────────────────────────

/**
 * Format a plain number with locale-appropriate digit grouping.
 *
 * @example
 *   formatNumber(1234567)     // IN  → "12,34,567"
 *   formatNumber(1234567)     // INTL → "1,234,567"
 *   formatNumber(1234.5, { decimals: 1 }) // IN → "1,234.5"
 */
export function formatNumber(
  value: number,
  opts?: { region?: Region; decimals?: number },
): string {
  const region = resolveRegion(opts?.region);
  const decimals = opts?.decimals ?? 0;

  return new Intl.NumberFormat(region === 'IN' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ─── Dates ────────────────────────────────────────────────────────────────

/** Sentinel string returned for invalid / null dates. */
const INVALID = '—';

/**
 * Format a date (day only, no time).
 *
 * @example
 *   formatDate('1970-01-01T00:00:00Z') // IN  → "01/01/1970"
 *   formatDate('1970-01-01T00:00:00Z') // INTL → "Jan 1, 1970"
 */
export function formatDate(
  date: string | number | Date | null | undefined,
  opts?: { region?: Region },
): string {
  const d = toDate(date);
  if (!d) return INVALID;

  const region = resolveRegion(opts?.region);

  if (region === 'IN') {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(d);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Format a date + time.
 *
 * @example
 *   formatDateTime('1970-01-01T14:30:00Z') // IN  → "01/01/1970, 20:00" (IST = +5:30)
 *   formatDateTime('1970-01-01T14:30:00Z') // INTL → "Jan 1, 1970, 2:30 PM"
 */
export function formatDateTime(
  date: string | number | Date | null | undefined,
  opts?: { region?: Region; hour12?: boolean },
): string {
  const d = toDate(date);
  if (!d) return INVALID;

  const region = resolveRegion(opts?.region);
  // Clock format is independent of region; default to the region's convention
  // (IN → 24h, INTL → 12h) when not explicitly set.
  const hour12 = opts?.hour12 ?? region !== 'IN';

  if (region === 'IN') {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12,
      timeZone: 'Asia/Kolkata',
    }).format(d);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(d);
}
