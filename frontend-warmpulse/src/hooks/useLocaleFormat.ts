/**
 * useLocaleFormat — PRIMARY component API for locale-aware formatting.
 *
 * Subscribes to `useLocaleStore` so any component using this hook re-renders
 * automatically when the user switches region in Settings.
 *
 * Usage:
 *   const { money, number, date, dateTime, region, setRegion } = useLocaleFormat();
 *   <span>{money(1234567)}</span>  // re-renders when region changes
 */

import { useLocaleStore } from '@/stores/locale';
import type { Region } from '@/stores/locale';
import { formatMoney, formatNumber, formatDate, formatDateTime } from '@/lib/format';

export interface LocaleFormatReturn {
  region: Region;
  setRegion: (r: Region) => void;
  /** Format a monetary amount in the current region's currency. */
  money: (amount: number, opts?: { decimals?: number }) => string;
  /** Format a number with locale-appropriate digit grouping. */
  number: (value: number, opts?: { decimals?: number }) => string;
  /** 12-hour clock when true, else 24-hour. Independent of region. */
  hour12: boolean;
  setHour12: (h: boolean) => void;
  /** Format a date (day only). */
  date: (d: string | number | Date | null | undefined) => string;
  /** Format a date + time (respects the 12/24h preference). */
  dateTime: (d: string | number | Date | null | undefined) => string;
}

export function useLocaleFormat(): LocaleFormatReturn {
  const region = useLocaleStore((s) => s.region);
  const setRegion = useLocaleStore((s) => s.setRegion);
  const hour12 = useLocaleStore((s) => s.hour12);
  const setHour12 = useLocaleStore((s) => s.setHour12);

  return {
    region,
    setRegion,
    hour12,
    setHour12,
    money: (amount, opts) => formatMoney(amount, { region, ...opts }),
    number: (value, opts) => formatNumber(value, { region, ...opts }),
    date: (d) => formatDate(d, { region }),
    dateTime: (d) => formatDateTime(d, { region, hour12 }),
  };
}
