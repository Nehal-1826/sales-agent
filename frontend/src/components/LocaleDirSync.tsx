import { useEffect } from 'react';
import { useLocaleStore } from '@/stores/locale';
import { RTL_LANGUAGES } from '@/lib/countries';

/**
 * Keeps <html lang> and <html dir> in sync with the active UI language so the
 * page reflows right-to-left for Arabic (and any future RTL language) and
 * screen readers announce the correct language. Renders nothing.
 */
export function LocaleDirSync() {
  const language = useLocaleStore((s) => s.language);
  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
  }, [language]);
  return null;
}
