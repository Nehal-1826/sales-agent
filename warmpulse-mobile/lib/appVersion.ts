/**
 * The running build's own version. MUST stay in sync with `app.json`
 * → expo.android.versionCode / expo.version. Bump both together on every
 * release, alongside frontend/downloads/version.json (see the release process
 * in docs/superpowers/specs/2026-06-27-cross-platform-app-update-prompt-design.md).
 *
 * versionCode is the integer the update check compares against the manifest.
 */
export const APP_VERSION_CODE = 15;
export const APP_VERSION_NAME = '1.0.14';
