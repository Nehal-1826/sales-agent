/**
 * Lightweight i18n for the website — no external dependency.
 *
 * Catalogs live under `lib/locales/*.ts` and are AUTO-MERGED here via Vite's
 * import.meta.glob. Each module may export one or more flat language maps named
 * by language code (`en`, `hi`, `es`, `fr`, …). The English source of truth is
 * split into area files (core/auth/landing/sections/howitworks/onboarding);
 * each additional language ships as one full-catalog file (`_es.ts`, `_fr.ts`,
 * …) exporting that language's map. To add a language: add `_<code>.ts` with a
 * matching `export const <code>` map and extend `Language` in lib/countries.
 *
 * `useT()` returns `t(key, vars?)` bound to the active language; missing keys
 * fall back to English, then to the key. Interpolate with {name}.
 */
import { useLocaleStore } from '@/stores/locale';
import type { Language } from './countries';

type Catalog = Record<string, Record<string, string> | undefined>;

const modules = import.meta.glob<Catalog>('./locales/*.ts', { eager: true });

const CATALOGS: Record<string, Record<string, string>> = {};
for (const mod of Object.values(modules)) {
  for (const [lang, map] of Object.entries(mod)) {
    if (!map || typeof map !== 'object') continue;
    CATALOGS[lang] = Object.assign(CATALOGS[lang] ?? {}, map);
  }
}

const en: Record<string, string> = CATALOGS.en ?? {};

export function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const s = CATALOGS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/** Component hook — re-renders on language change. */
export function useT(): TFunc {
  const lang = useLocaleStore((s) => s.language);
  return (key, vars) => translate(lang, key, vars);
}
