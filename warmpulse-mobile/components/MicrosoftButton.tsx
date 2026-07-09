import { useState } from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { wp, fonts } from '../theme/tokens';
import { useMicrosoftSignIn } from '../lib/microsoftAuth';
import { useAuth } from '../lib/auth';

/**
 * "Continue with Microsoft" — drives the Firebase OAuth flow and, on success,
 * exchanges the Firebase ID token for a backend session via the auth context.
 * Surfaces all failures (including "not configured yet") through `onError`
 * so the control never silently no-ops.
 */
export function MicrosoftButton({
  onError,
  onAuthed,
}: {
  onError: (message: string) => void;
  onAuthed: () => void;
}) {
  const { loginWithIdToken } = useAuth();
  const [busy, setBusy] = useState(false);

  const { signIn } = useMicrosoftSignIn(
    async (idToken) => {
      try {
        await loginWithIdToken(idToken);
        onAuthed();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Microsoft sign-in failed.');
      } finally {
        setBusy(false);
      }
    },
    (message) => {
      setBusy(false);
      onError(message);
    },
  );

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          await signIn();
        }}
        style={({ pressed }) => [styles.btn, { opacity: pressed || busy ? 0.8 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={wp.text} />
        ) : (
          <>
            <View style={styles.glyph}>
              <Text style={styles.glyphText}>M</Text>
            </View>
            <Text style={styles.label}>Continue with Microsoft</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: wp.borderStrong,
    backgroundColor: 'rgba(23,23,23,0.6)',
  },
  glyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { color: '#00A4EF', fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700' },
  label: { color: wp.text, fontSize: 15, fontFamily: fonts.sansSemibold },
});
