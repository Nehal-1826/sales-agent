/** Core/shared strings. Area catalogs live beside this file and are auto-merged
 *  by lib/i18n via import.meta.glob — add a new `<area>.ts` exporting `en`/`hi`
 *  and every t('…') call site localizes. */
export const en: Record<string, string> = {
  // nav
  'nav.signin': 'Sign in',
  'nav.startFree': 'Start free',
  'nav.howItWorks': 'How it works',
  'nav.pricing': 'Pricing',
  // hero
  'hero.startWarmingFree': 'Start warming free',
  'hero.seeHowItWorks': 'See how it works',
  'hero.downloadApp': 'Download app',
  'hero.trustLine': 'Connect a mailbox in 30 seconds — no card required',
  // pricing
  'pricing.monthly': 'Monthly',
  'pricing.yearly': 'Yearly',
  'pricing.perMonth': '/ month',
  'pricing.getStarted': 'Get started',
  // common
  'common.country': 'Country',
  'common.language': 'Language',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
};

export const hi: Record<string, string> = {
  'nav.signin': 'साइन इन',
  'nav.startFree': 'मुफ़्त शुरू करें',
  'nav.howItWorks': 'यह कैसे काम करता है',
  'nav.pricing': 'मूल्य निर्धारण',
  'hero.startWarmingFree': 'मुफ़्त वार्मअप शुरू करें',
  'hero.seeHowItWorks': 'देखें यह कैसे काम करता है',
  'hero.downloadApp': 'ऐप डाउनलोड करें',
  'hero.trustLine': '30 सेकंड में मेलबॉक्स कनेक्ट करें — कार्ड की ज़रूरत नहीं',
  'pricing.monthly': 'मासिक',
  'pricing.yearly': 'वार्षिक',
  'pricing.perMonth': '/ माह',
  'pricing.getStarted': 'शुरू करें',
  'common.country': 'देश',
  'common.language': 'भाषा',
  'common.save': 'सहेजें',
  'common.cancel': 'रद्द करें',
  'common.loading': 'लोड हो रहा है…',
};
