# Country locale standards (currency + language + formats) — design

**Date:** 2026-06-27 · **Status:** Approved, implementing

## Goal

One **Country** selector that, when changed, updates **currency**, **number/date
formats**, AND **UI language** together — on both the website and the mobile app.
Ship **English + Hindi** so the language switch is visibly real; architecture
makes adding more languages a drop-in JSON file.

## Country model

`COUNTRIES`: each country → `{ code, flag, name, currency: CurrencyCode, region: 'IN'|'INTL', language: 'en'|'hi' }`.
Initial set: India (INR/en-IN/hi default-capable), USA (USD/en-US/en), UK (GBP/en),
UAE (AED/en — Arabic later), Germany (EUR/en), Australia, Canada, Singapore.
Default: India. Picking a country sets currency (existing currency store) + region
(existing locale store) + language in one action.

## i18n framework (lightweight, no heavy dep)

- Web: `frontend/src/lib/i18n.ts` — namespaced catalogs (`en`, `hi`) + `t(key, vars?)`
  + `useT()` hook subscribing to the locale store's `language`. `{var}` interpolation.
  Missing key → falls back to English, then to the key itself.
- App: `warmpulse-mobile/lib/i18n.ts` — same tiny API, language from the app locale store.
- Catalog namespaces: `common`, `nav`, `hero`, `pricing`, `onboarding`, `app`, `admin`.

## Selector

- Web: `CountrySwitcher` (flag + country name dropdown) replaces the currency-only
  switcher in the landing nav; setting a country calls `setCountry()` → currency +
  region + language. Keep `useLocaleFormat` for money/number/date.
- App: a Country row in Settings + the language applied app-wide via the locale store.

## Scope this pass (high-visibility surfaces → `t()` + Hindi)

Web: landing nav + hero CTAs, pricing toggle/plan labels, onboarding step labels,
common buttons. App: auth screens (login/signup), app-shell section titles, common
buttons. Remaining deep strings migrate incrementally — the framework is present
everywhere, so each migrated string is instantly translatable.

## Payment

Payment currency already follows the currency store; the Country selector drives that
store, so checkout currency continues to track the selected country. No backend change.

## Non-goals / honest limits

- Not every string is wrapped this pass ("Everything" is incremental on top of the core).
- Arabic/RTL deferred until an Arabic catalog is added.
- Hindi strings are machine-grade translations for the converted surfaces.
