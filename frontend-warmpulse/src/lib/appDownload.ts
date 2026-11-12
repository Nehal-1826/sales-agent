/**
 * Single source of truth for the WarmPulse mobile (Android) app download.
 *
 * The APK is built from `warmpulse-mobile/` (Expo) and hosted by the
 * frontend nginx container at `/downloads/warmpulse.apk` (see the
 * `frontend/Dockerfile` COPY + nginx static route). Keep this in sync
 * with where the build pipeline drops the artifact.
 */
export const APP_APK_URL = '/downloads/warmpulse.apk';
