/**
 * Token-at-rest for the mobile app. SecureStore keeps the JWT pair in the
 * Android Keystore-backed encrypted store rather than plain AsyncStorage.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'wp.access_token';
const REFRESH_KEY = 'wp.refresh_token';
const DISMISSED_UPDATE_KEY = 'wp.dismissed_update_code';

export async function saveTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

/** versionCode the user last tapped "Later" on, so we don't re-nag that release. */
export async function getDismissedUpdate(): Promise<number> {
  const v = await SecureStore.getItemAsync(DISMISSED_UPDATE_KEY);
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setDismissedUpdate(code: number): Promise<void> {
  await SecureStore.setItemAsync(DISMISSED_UPDATE_KEY, String(code));
}
