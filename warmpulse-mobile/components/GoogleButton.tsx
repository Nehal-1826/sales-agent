import { useState } from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { wp, fonts } from '../theme/tokens';
import { useGoogleSignIn } from '../lib/googleAuth';
import { useAuth } from '../lib/auth';

/**
 * "Continue with Google" — drives the Firebase ID-token flow and, on success,
 * exchanges it for a backend session via the auth context. Surfaces all
 * failures (including "not configured yet") through `onError` so the control
 * never silently no-ops.
 */
export function GoogleButton({
  onError,
  onAuthed,
}: {
  onError: (message: string) => void;
  onAuthed: () => void;
}) {
  const { loginWithIdToken } = useAuth();
  const [busy, setBusy] = useState(false);

  const { signIn } = useGoogleSignIn(
    async (idToken) => {
      try {
        await loginWithIdToken(idToken);
        onAuthed();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Google sign-in failed.');
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
    <View style={{ marginTop: 18 }}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.or}>or</Text>
        <View style={styles.line} />
      </View>
      <Pressable
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          const launched = await signIn();
          if (!launched) setBusy(false);
        }}
        style={({ pressed }) => [styles.btn, { opacity: pressed || busy ? 0.8 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={wp.text} />
        ) : (
          <>
            <View style={styles.glyph}>
              <Text style={styles.glyphText}>G</Text>
            </View>
            <Text style={styles.label}>Continue with Google</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: wp.border },
  or: { color: wp.textFaint, fontSize: 12, fontFamily: fonts.sans },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: wp.borderStrong,
    backgroundColor: wp.surface2,
  },
  glyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { color: '#4285F4', fontSize: 13, fontFamily: fonts.sansBold },
  label: { color: wp.text, fontSize: 15, fontFamily: fonts.sansSemibold },
});
