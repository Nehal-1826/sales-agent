import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Currency conversion + formatting.
 *
 * Base prices are stored in USD in the source (legacy from US pricing). The
 * currency module converts to whatever the user selected, with INR as the
 * default per ops decision (primary market).
 *
 * Rates are approximate snapshots — fine for marketing copy. Production
 * checkout MUST hit a server-side rate API (these don't update live).
 */

export type CurrencyCode =
  | 'INR' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'SGD' | 'AED'
  | 'SAR' | 'BRL' | 'CNY' | 'JPY' | 'RUB';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  flag: string;
  name: string;
  /** Conversion: 1 USD = this many of the currency. */
  rateFromUsd: number;
  /** Locale used for number grouping (e.g., en-IN uses lakh format for INR). */
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  INR: { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee', rateFromUsd: 83.5, locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', flag: '🇺🇸', name: 'US Dollar', rateFromUsd: 1, locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', flag: '🇪🇺', name: 'Euro', rateFromUsd: 0.93, locale: 'en-IE' },
  GBP: { code: 'GBP', symbol: '£', flag: '🇬🇧', name: 'British Pound', rateFromUsd: 0.79, locale: 'en-GB' },
  AUD: { code: 'AUD', symbol: 'A$', flag: '🇦🇺', name: 'Australian Dollar', rateFromUsd: 1.55, locale: 'en-AU' },
  CAD: { code: 'CAD', symbol: 'C$', flag: '🇨🇦', name: 'Canadian Dollar', rateFromUsd: 1.40, locale: 'en-CA' },
  SGD: { code: 'SGD', symbol: 'S$', flag: '🇸🇬', name: 'Singapore Dollar', rateFromUsd: 1.34, locale: 'en-SG' },
  AED: { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', name: 'UAE Dirham', rateFromUsd: 3.67, locale: 'en-AE' },
  SAR: { code: 'SAR', symbol: 'ر.س', flag: '🇸🇦', name: 'Saudi Riyal', rateFromUsd: 3.75, locale: 'ar-SA' },
  BRL: { code: 'BRL', symbol: 'R$', flag: '🇧🇷', name: 'Brazilian Real', rateFromUsd: 5.4, locale: 'pt-BR' },
  CNY: { code: 'CNY', symbol: '¥', flag: '🇨🇳', name: 'Chinese Yuan', rateFromUsd: 7.2, locale: 'zh-CN' },
  JPY: { code: 'JPY', symbol: '¥', flag: '🇯🇵', name: 'Japanese Yen', rateFromUsd: 157, locale: 'ja-JP' },
  RUB: { code: 'RUB', symbol: '₽', flag: '🇷🇺', name: 'Russian Ruble', rateFromUsd: 90, locale: 'ru-RU' },
};

export const CURRENCY_LIST: Currency[] = [
  CURRENCIES.INR, // primary
  CURRENCIES.USD,
  CURRENCIES.EUR,
  CURRENCIES.GBP,
  CURRENCIES.AUD,
  CURRENCIES.CAD,
  CURRENCIES.SGD,
  CURRENCIES.AED,
  CURRENCIES.SAR,
  CURRENCIES.BRL,
  CURRENCIES.CNY,
  CURRENCIES.JPY,
  CURRENCIES.RUB,
];

interface CurrencyState {
  code: CurrencyCode;
  setCode: (code: CurrencyCode) => void;
}

const STORAGE_KEY = 'warmpulse.currency';

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      code: 'INR',
      setCode: (code) => set({ code }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Bump when the default changes — invalidates any older cached
      // 'USD' that users picked up before INR became the default. Old
      // localStorage entries with `version < 2` are discarded and the
      // store falls back to the initialiser ('INR' above).
      version: 2,
    },
  ),
);

/** Round to the most attractive value for the currency: nearest 10 for INR, nearest 1 otherwise. */
function smartRound(amount: number, currency: Currency): number {
  if (currency.code === 'INR') {
    // For INR, prefer nicer round numbers — round to nearest 10 below ₹1k, nearest 100 above
    if (amount < 1000) return Math.round(amount / 10) * 10;
    if (amount < 10000) return Math.round(amount / 50) * 50;
    return Math.round(amount / 100) * 100;
  }
  // For others, round to nearest 1
  return Math.round(amount);
}

/**
 * Format an INR-base price for display in the selected currency.
 *
 * Plan prices are stored and entered (in /admin/plans) as INR — the same value
 * the Cashfree gateway charges (it bills `price_cents / 100` rupees). In the
 * default INR display we show the EXACT entered amount (admin ₹56,789 == public
 * ₹56,789) — no "attractive" rounding, so the two never disagree. Other
 * currencies are approximate conversions, so we smart-round those for polish.
 * Example: formatPrice(56789) with INR -> "₹56,789"; with USD -> "$680".
 */
export function formatPrice(inrAmount: number, code: CurrencyCode, opts: { round?: boolean } = {}): string {
  const currency = CURRENCIES[code];
  // Convert INR base → target currency: INR -> USD (÷83.5) -> target (×rate).
  const raw = (inrAmount / CURRENCIES.INR.rateFromUsd) * currency.rateFromUsd;
  // Never round the base currency (INR) — it must match the admin value exactly.
  const value =
    code === 'INR' ? raw : opts.round !== false ? smartRound(raw, currency) : raw;
  // Use Intl.NumberFormat for locale-correct grouping (lakh/crore for en-IN)
  const formatter = new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  return formatter.format(value);
}

/** Convenience hook — returns the active currency object + setter + formatter. */
export function useCurrency() {
  const code = useCurrencyStore((s) => s.code);
  const setCode = useCurrencyStore((s) => s.setCode);
  const currency = CURRENCIES[code];
  return {
    code,
    currency,
    setCode,
    format: (usd: number) => formatPrice(usd, code),
  };
}
