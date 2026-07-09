/**
 * One-tap OAuth connect buttons (Google + Microsoft), shown above the
 * app-password form in onboarding and the Mailboxes add-sheet. On success the
 * mailbox already exists server-side; we hand the caller the connected email so
 * it can refetch + advance.
 */
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Mail } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { hexA } from '../../../components/Glass';
import { connectMailboxOAuth, oauthReasonText, type OAuthProvider } from '../../../lib/oauthConnect';

export function OAuthConnectButtons({
  dailyTarget = 50,
  onConnected,
}: {
  dailyTarget?: number;
  onConnected: (email?: string) => void;
}) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (provider: OAuthProvider) => {
    if (busy) return;
    setError(null);
    setBusy(provider);
    try {
      const res = await connectMailboxOAuth(provider, dailyTarget);
      if (res.status === 'ok') onConnected(res.email);
      else if (res.status === 'error') setError(oauthReasonText(res.reason));
      // cancelled → silent
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ gap: 10 }}>
        <ProviderButton
          label="Continue with Google"
          tint="#EA4335"
          loading={busy === 'google'}
          disabled={!!busy}
          onPress={() => run('google')}
        />
        <ProviderButton
          label="Continue with Microsoft"
          tint="#2F6FED"
          loading={busy === 'microsoft'}
          disabled={!!busy}
          onPress={() => run('microsoft')}
        />
      </View>

      {error ? (
        <View style={s.errBox}>
          <Text style={s.errText}>{error}</Text>
        </View>
      ) : null}

      <View style={s.divider}>
        <View style={s.line} />
        <Text style={s.orText}>or use an app password</Text>
        <View style={s.line} />
      </View>
    </View>
  );
}

function ProviderButton({
  label,
  tint,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  tint: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, { opacity: disabled && !loading ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={wp.text} />
      ) : (
        <>
          <View style={[s.dot, { backgroundColor: hexA(tint, 0.18), borderColor: tint }]}>
            <Mail size={13} color={tint} strokeWidth={2.2} />
          </View>
          <Text style={s.btnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: wp.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  errBox: {
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: hexA(wp.danger, 0.4),
    backgroundColor: hexA(wp.danger, 0.08),
  },
  errText: { color: wp.danger, fontSize: 12.5, fontFamily: fonts.sans, lineHeight: 17 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  line: { flex: 1, height: 1, backgroundColor: wp.border },
  orText: { color: wp.textFaint, fontSize: 11, fontFamily: fonts.mono },
});
