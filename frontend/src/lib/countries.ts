import type { CurrencyCode } from './currency';

/**
 * Country/locale "standards". Picking one drives currency + number/date format
 * region + UI language together. India appears as two standards (English and
 * हिंदी) so the global default stays English while Hindi is one tap away,
 * without flipping the language for every existing user.
 */
export type Language = 'en' | 'hi' | 'es' | 'fr' | 'de' | 'ar' | 'pt' | 'zh' | 'ja' | 'ru';

/** Languages that render right-to-left — drives <html dir="rtl">. */
export const RTL_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['ar']);

export type StandardId =
  | 'IN-en' | 'IN-hi' | 'US' | 'GB' | 'AE' | 'AU' | 'CA' | 'SG'
  | 'ES' | 'FR' | 'DE' | 'SA' | 'BR' | 'CN' | 'JP' | 'RU';

export interface CountryStandard {
  id: StandardId;
  flag: string;
  label: string;
  currency: CurrencyCode;
  region: 'IN' | 'INTL';
  language: Language;
}

export const COUNTRY_STANDARDS: CountryStandard[] = [
  { id: 'IN-en', flag: '🇮🇳', label: 'India · English', currency: 'INR', region: 'IN', language: 'en' },
  { id: 'IN-hi', flag: '🇮🇳', label: 'भारत · हिंदी', currency: 'INR', region: 'IN', language: 'hi' },
  { id: 'US', flag: '🇺🇸', label: 'United States · English', currency: 'USD', region: 'INTL', language: 'en' },
  { id: 'GB', flag: '🇬🇧', label: 'United Kingdom · English', currency: 'GBP', region: 'INTL', language: 'en' },
  { id: 'AE', flag: '🇦🇪', label: 'UAE · English', currency: 'AED', region: 'INTL', language: 'en' },
  { id: 'AU', flag: '🇦🇺', label: 'Australia · English', currency: 'AUD', region: 'INTL', language: 'en' },
  { id: 'CA', flag: '🇨🇦', label: 'Canada · English', currency: 'CAD', region: 'INTL', language: 'en' },
  { id: 'SG', flag: '🇸🇬', label: 'Singapore · English', currency: 'SGD', region: 'INTL', language: 'en' },
  { id: 'ES', flag: '🇪🇸', label: 'España · Español', currency: 'EUR', region: 'INTL', language: 'es' },
  { id: 'FR', flag: '🇫🇷', label: 'France · Français', currency: 'EUR', region: 'INTL', language: 'fr' },
  { id: 'DE', flag: '🇩🇪', label: 'Deutschland · Deutsch', currency: 'EUR', region: 'INTL', language: 'de' },
  { id: 'SA', flag: '🇸🇦', label: 'السعودية · العربية', currency: 'SAR', region: 'INTL', language: 'ar' },
  { id: 'BR', flag: '🇧🇷', label: 'Brasil · Português', currency: 'BRL', region: 'INTL', language: 'pt' },
  { id: 'CN', flag: '🇨🇳', label: '中国 · 中文', currency: 'CNY', region: 'INTL', language: 'zh' },
  { id: 'JP', flag: '🇯🇵', label: '日本 · 日本語', currency: 'JPY', region: 'INTL', language: 'ja' },
  { id: 'RU', flag: '🇷🇺', label: 'Россия · Русский', currency: 'RUB', region: 'INTL', language: 'ru' },
];

export const DEFAULT_STANDARD_ID: StandardId = 'IN-en';

export function standardById(id: string): CountryStandard {
  return COUNTRY_STANDARDS.find((s) => s.id === id) ?? COUNTRY_STANDARDS[0]!;
}
