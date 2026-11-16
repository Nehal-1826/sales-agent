# Cross-platform "Update available" prompt — design

**Date:** 2026-06-27
**Status:** Approved, implementing

## Goal

When a newer Android app version is published, prompt users to update:
- **Mobile app:** dismissable popup ("Update now" / "Later").
- **Website:** dismissable promo banner ("New app available — Download").

Both read one shared version manifest so a single release bump drives both.

## Source of truth — version manifest

`frontend/downloads/version.json` (bind-mounted next to the APK, served at
`/downloads/version.json` — same origin the app and site already use):

```json
{
  "android": {
    "versionCode": 2,
    "versionName": "1.0.1",
    "apkUrl": "/downloads/warmpulse.apk",
    "notes": "Google sign-in + bug fixes",
    "publishedAt": "2026-06-27"
  }
}
```

nginx serves `version.json` with `no-cache` so a new release propagates immediately.
The manifest is the integer `versionCode` comparison key; `versionName`/`notes` are display-only.

## Mobile app (optional / dismissable)

- `lib/appVersion.ts` — `APP_VERSION_CODE` constant, kept in sync with `app.json`
  `expo.android.versionCode`. Single integer the running build knows itself by.
- `lib/updateCheck.ts` — `fetchLatestAndroid()` GETs the manifest (absolute
  `${API_BASE_URL}/downloads/version.json`); returns the `android` block or null on
  any error (offline must never block the app).
- `lib/storage.ts` — add `getDismissedUpdate()` / `setDismissedUpdate(code)` (SecureStore).
- `components/UpdatePrompt.tsx` — self-managing modal. On mount: fetch manifest; show
  iff `latest.versionCode > APP_VERSION_CODE` **and** `latest.versionCode !== dismissed`.
  - **Update now** → `Linking.openURL(absolute apkUrl)` (downloads; user taps to install
    over the existing app — same signing key → in-place update).
  - **Later** → `setDismissedUpdate(latest.versionCode)`; won't re-show until the next release.
- Mounted once in `App.tsx` `Root`, rendered on top of all screens.

## Website (download-the-new-app promo)

- `components/AppUpdateBanner.tsx` — on mount fetch `/downloads/version.json`; if
  `latest.versionCode > Number(localStorage['wp.dismissedAppVersion'] ?? 0)` → show a
  dismissable bottom banner: "New WarmPulse app (vX.Y.Z) available — **Download**"
  (→ `apkUrl`) + dismiss (writes the code to localStorage). Shows once per release per browser.
  Fails silent if the manifest is missing.
- Mounted app-wide in `App.tsx` beside `ImpersonationBanner` (above routed content).

## Release process (per new APK)

1. Bump `app.json` `expo.android.versionCode` (+`version`/versionName).
2. Bump `lib/appVersion.ts` `APP_VERSION_CODE` to match.
3. Bump `frontend/downloads/version.json` (versionCode/versionName/notes/publishedAt).
4. Rebuild APK, host (`frontend/downloads/warmpulse.apk`).

## Rejected alternatives

- **Play in-app-updates** — needs a Play Store listing; app is sideloaded.
- **Expo Updates (OTA)** — only swaps the JS bundle; can't ship native changes (e.g. the
  google-signin native module), so it can't be the update channel here.

## Constraints / non-goals

- No silent/auto install on Android (impossible for sideloaded apps) — "Update now"
  downloads the APK; the user taps install.
- Website banner is promo-only, not a "reload the site" prompt (the SPA updates on reload).
- Offline / missing-manifest must never block either surface.
