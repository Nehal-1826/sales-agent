import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCurrencyStore } from '@/lib/currency';
import { COUNTRY_STANDARDS, DEFAULT_STANDARD_ID, standardById, type Language, type StandardId } from '@/lib/countries';

/**
 * Region/locale preference for the whole UI.
 *
 * A "country standard" (see lib/countries) bundles currency + format region +
 * UI language. `setStandard` applies all three at once: it sets the currency
 * (via the currency store), the format region, and the language. `setRegion` is
 * kept for the existing Settings region toggle.
 *
 * IN  → ₹ INR, Indian lakh/crore grouping (en-IN), DD/MM/YYYY, 24h.
 * INTL → $ USD, US grouping (en-US), MMM D YYYY, user-local tz, 12h.
 * Default standard is India · English (region IN, language en).
 */
export type Region = 'IN' | 'INTL';

interface LocaleState {
  region: Region;
  setRegion: (r: Region) => void;
  /** Active UI language ('en' | 'hi'). Driven by the country standard. */
  language: Language;
  /** Selected country standard id. */
  standardId: StandardId;
  /** Apply a country standard → currency + region + language together. */
  setStandard: (id: StandardId) => void;
  /** Clock format, independent of region. Default 24h (IN primary market). */
  hour12: boolean;
  setHour12: (h: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      region: 'IN',
      setRegion: (region) => set({ region }),
      language: 'en',
      standardId: DEFAULT_STANDARD_ID,
      setStandard: (id) => {
        const s = standardById(id);
        // Drive the currency store so prices + checkout follow the country.
        useCurrencyStore.getState().setCode(s.currency);
        set({ standardId: id, region: s.region, language: s.language });
      },
      hour12: false,
      setHour12: (hour12) => set({ hour12 }),
    }),
    {
      name: 'wp-locale',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // v3 adds language + standardId. Older persisted state lacks them;
      // backfill from the persisted region so existing users keep their format.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<LocaleState>;
        if (!p.standardId) {
          p.standardId = p.region === 'INTL' ? 'US' : DEFAULT_STANDARD_ID;
          p.language = 'en';
        }
        return p as LocaleState;
      },
    },
  ),
);

export { COUNTRY_STANDARDS };
