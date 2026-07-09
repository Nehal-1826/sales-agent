/**
 * ConnectMailbox — the real app-password / SMTP connect flow, shared by the
 * onboarding wizard and the Mailboxes "Add mailbox" sheet.
 *
 * Flow: type email → auto-detect SMTP/IMAP hosts from the domain MX → type the
 * app password → "Verify & connect" probes the credentials (no save) and, on
 * success, creates the mailbox. The app password lives only in local state for
 * the duration of the probe/create and is cleared on success.
 *
 * Also supports OAuth for Gmail & Outlook providers.
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, ShieldCheck, Check } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Field } from '../../../components/Field';
import { hexA } from '../../../components/Glass';
import { ApiError } from '../../../lib/api';
import {
  useDetectProvider,
  useProbeMailbox,
  useCreateMailbox,
  useCreateOAuthMailbox,
  type MailboxCredentials,
} from '../../../lib/mutations';
import { useGmailMailboxOAuth, useOutlookMailboxOAuth, handleOAuthCallback } from '../../../lib/mailboxOAuth';
import { useURL } from 'expo-linking';
import type { Mailbox } from '../../../lib/data';

export function ConnectMailbox({
  dailyTarget = 50,
  provider = 'gmail',
  ctaLabel = 'Verify & connect',
  onConnected,
}: {
  dailyTarget?: number;
  provider?: string;
  ctaLabel?: string;
  onConnected: (mailbox: Mailbox) => void;
}) {
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [error, setError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const detect = useDetectProvider();
  const probe = useProbeMailbox();
  const create = useCreateMailbox();
  const createOAuth = useCreateOAuthMailbox();
  const gmailOAuth = useGmailMailboxOAuth();
  const outlookOAuth = useOutlookMailboxOAuth();
  const busy = probe.isPending || create.isPending;

  const isGmail = provider === 'gmail';
  const isOutlook = provider === 'outlook' || provider === 'outlook_oauth';
  const supportsOAuth = isGmail || isOutlook;

  // Handle OAuth callback from deep link
  const url = useURL();
  useEffect(() => {
    if (url) {
      console.log('OAuth callback URL received:', url);
      try {
        const parsed = new URL(url);
        console.log('Parsed pathname:', parsed.pathname);
        if (parsed.pathname?.startsWith('/oauth/callback')) {
          console.log('Calling handleOAuthCallback');
          handleOAuthCallback(url);
        }
      } catch (e) {
        console.error('Failed to parse OAuth callback URL:', e);
      }
    }
  }, [url]);

  const connectWithOAuth = async (oauthProvider: 'gmail' | 'outlook') => {
    setOauthError(null);
    try {
      const result = oauthProvider === 'gmail'
        ? await gmailOAuth.signIn()
        : await outlookOAuth.signIn();

      if (result.success && result.email) {
        createOAuth.mutate(
          {
            provider: result.provider,
            email: result.email,
            oauth_code: result.code || '',
          },
          {
            onSuccess: (mailbox) => {
              onConnected(mailbox);
            },
            onError: (e) => {
              setError(e instanceof Error ? e.message : 'OAuth connection failed.');
            },
          },
        );
      } else if (result.error) {
        setOauthError(result.error || 'OAuth connection failed. Please try again.');
      }
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : 'OAuth connection failed. Please try again.');
    }
  };

  const onEmailBlur = () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) return;
    detect.mutate(trimmed, {
      onSuccess: (d) => {
        if (d.smtp_host) setSmtpHost(d.smtp_host);
        if (d.smtp_port) setSmtpPort(String(d.smtp_port));
        if (d.imap_host) setImapHost(d.imap_host);
        if (d.imap_port) setImapPort(String(d.imap_port));
      },
    });
  };

  const connect = () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) return setError('Enter a valid email address.');
    if (!appPassword.trim()) return setError('Enter your app password.');
    if (!smtpHost.trim()) return setError('SMTP host could not be detected — enter it manually.');

    const creds: MailboxCredentials = {
      email_address: trimmedEmail,
      smtp_host: smtpHost.trim(),
      smtp_port: Number(smtpPort) || 587,
      smtp_username: trimmedEmail,
      smtp_password: appPassword,
      imap_host: imapHost.trim() || null,
      imap_port: imapHost.trim() ? Number(imapPort) || 993 : null,
    };

    probe.mutate(creds, {
      onSuccess: () => {
        create.mutate(
          { ...creds, daily_target: dailyTarget },
          {
            onSuccess: (mailbox) => {
              setAppPassword('');
              onConnected(mailbox);
            },
            onError: (e) =>
              setError(e instanceof ApiError ? e.message : 'Could not save this mailbox. Try again.'),
          },
        );
      },
      onError: (e) =>
        setError(
          e instanceof ApiError ? e.message : 'Credentials rejected — check the email and app password.',
        ),
    });
  };

  return (
    <View>
      {/* OAuth buttons for supported providers */}
      {supportsOAuth && (
        <View style={{ marginBottom: 16 }}>
          {isGmail && (
            <Pressable
              onPress={() => connectWithOAuth('gmail')}
              style={({ pressed }) => [s.oauthBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[s.oauthIcon, { backgroundColor: '#EA4335' }]}>
                <Text style={s.oauthIconText}>G</Text>
              </View>
              <Text style={s.oauthBtnText}>Connect with Google</Text>
            </Pressable>
          )}
          {isOutlook && (
            <Pressable
              onPress={() => connectWithOAuth('outlook')}
              style={({ pressed }) => [s.oauthBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[s.oauthIcon, { backgroundColor: '#00A4EF' }]}>
                <Text style={s.oauthIconText}>M</Text>
              </View>
              <Text style={s.oauthBtnText}>Connect with Microsoft</Text>
            </Pressable>
          )}
          <Text style={s.oauthDivider}>— or connect manually —</Text>
        </View>
      )}

      {oauthError && (
        <View style={[s.errBox, { borderColor: hexA(wp.warning, 0.4), backgroundColor: hexA(wp.warning, 0.08) }]}>
          <Text style={[s.errText, { color: wp.warning }]}>{oauthError}</Text>
        </View>
      )}

      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        onBlur={onEmailBlur}
        placeholder="you@company.com"
        Icon={Mail}
        keyboardType="email-address"
      />
      <Field
        label="App password"
        value={appPassword}
        onChangeText={setAppPassword}
        placeholder="xxxx xxxx xxxx xxxx"
        secure
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 2 }}>
          <Field label="SMTP host" value={smtpHost} onChangeText={setSmtpHost} placeholder="smtp.gmail.com" autoCapitalize="none" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Port" value={smtpPort} onChangeText={setSmtpPort} placeholder="587" keyboardType="number-pad" />
        </View>
      </View>

      {detect.isPending && (
        <Text style={s.detecting}>Detecting mail server…</Text>
      )}
      {error && (
        <View style={s.errBox}>
          <Text style={s.errText}>{error}</Text>
        </View>
      )}

      <Pressable onPress={connect} disabled={busy} style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1, marginTop: 4 })}>
        <LinearGradient colors={[wp.accent, wp.accentHover]} style={s.cta}>
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <ShieldCheck size={15} color="#fff" strokeWidth={2} />
              <Text style={s.ctaText}>{ctaLabel}</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
      <View style={s.hintRow}>
        <Check size={12} color={wp.success} strokeWidth={2.4} />
        <Text style={s.hint}>Gmail & Workspace: create an App Password under Google Account → Security.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  detecting: { color: wp.textFaint, fontSize: 11.5, fontFamily: fonts.mono, marginBottom: 10 },
  errBox: { padding: 11, borderRadius: 10, borderWidth: 1, borderColor: hexA(wp.danger, 0.4), backgroundColor: hexA(wp.danger, 0.08), marginBottom: 12 },
  errText: { color: wp.danger, fontSize: 12.5, fontFamily: fonts.sans, lineHeight: 17 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12 },
  ctaText: { color: '#fff', fontSize: 14, fontFamily: fonts.sansSemibold },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 2 },
  hint: { color: wp.textDim, fontSize: 11.5, fontFamily: fonts.sans, flex: 1, lineHeight: 16 },
  oauthBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 12, borderWidth: 1, borderColor: wp.border, backgroundColor: 'rgba(26,26,26,0.6)' },
  oauthIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  oauthIconText: { color: '#fff', fontSize: 13, fontFamily: fonts.sansBold },
  oauthBtnText: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  oauthDivider: { color: wp.textFaint, fontSize: 11.5, fontFamily: fonts.mono, textAlign: 'center', marginTop: 10, marginBottom: 14 },
});
