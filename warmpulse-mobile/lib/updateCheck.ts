/**
 * Checks the hosted version manifest for a newer Android build. Pure data —
 * the UI (components/UpdatePrompt) decides whether to show anything.
 */
import { API_BASE_URL } from './config';

export type AndroidRelease = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
  publishedAt?: string;
};

/** Absolute APK URL for Linking.openURL (manifest stores a site-relative path). */
export function absoluteApkUrl(apkUrl: string): string {
  if (/^https?:\/\//i.test(apkUrl)) return apkUrl;
  return `${API_BASE_URL}${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`;
}

/**
 * Fetch the latest Android release block, or null on any failure — offline or a
 * missing/garbage manifest must never block the app.
 */
export async function fetchLatestAndroid(): Promise<AndroidRelease | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/downloads/version.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { android?: Partial<AndroidRelease> };
    const a = data?.android;
    if (!a || typeof a.versionCode !== 'number' || typeof a.apkUrl !== 'string') return null;
    return {
      versionCode: a.versionCode,
      versionName: typeof a.versionName === 'string' ? a.versionName : String(a.versionCode),
      apkUrl: a.apkUrl,
      notes: typeof a.notes === 'string' ? a.notes : undefined,
      publishedAt: typeof a.publishedAt === 'string' ? a.publishedAt : undefined,
    };
  } catch {
    return null;
  }
}
