/**
 * Notifications plumbing for the WarmPulse app.
 *
 * Two layers:
 *  1. LOCAL OS notifications — no server, no Expo project needed. When the
 *     in-app inbox poll discovers new unread items we present them as real
 *     OS notifications (banner + sound) so the user is alerted even while
 *     reading another screen. Requires the POST_NOTIFICATIONS permission.
 *  2. REMOTE push token — best-effort. If an Expo/EAS projectId is configured
 *     we fetch an Expo push token and register it with the backend so the
 *     server can deliver pushes when the app is closed. Without a projectId
 *     this silently no-ops (local notifications still work).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { authFetch } from './api';

const CHANNEL_ID = 'default';

// Show notifications while the app is foregrounded (default RN behaviour is to
// suppress them). Banner + list + sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Create the Android notification channel (no-op on iOS / repeat calls). */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'WarmPulse alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#F26522',
    });
  } catch {
    // channel creation is best-effort
  }
}

export async function getPermissionStatus(): Promise<PermStatus> {
  if (!Device.isDevice) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Ask for permission. Returns the resulting status. */
export async function requestPermission(): Promise<PermStatus> {
  if (!Device.isDevice) return 'unsupported';
  try {
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Present a notification immediately (used for inbox items while running). */
export async function presentLocal(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: 'default' },
      trigger: null, // fire now
    });
  } catch {
    // best-effort
  }
}

function resolveProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId || (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/**
 * Best-effort remote registration. Acquires an Expo push token (only possible
 * when an EAS projectId is configured) and registers it with the backend.
 * Returns the token, or null when remote push isn't available on this build.
 */
export async function registerRemotePush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const status = await getPermissionStatus();
  if (status !== 'granted') return null;
  const projectId = resolveProjectId();
  if (!projectId) return null; // no Expo project → background push not wired
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;
    await authFetch('/api/workspace/notifications-inbox/devices', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    return token;
  } catch {
    return null;
  }
}

/** Drop the remote token (called on logout / when disabling). */
export async function unregisterRemotePush(): Promise<void> {
  const projectId = resolveProjectId();
  if (!projectId || !Device.isDevice) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await authFetch('/api/workspace/notifications-inbox/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  } catch {
    // best-effort
  }
}
