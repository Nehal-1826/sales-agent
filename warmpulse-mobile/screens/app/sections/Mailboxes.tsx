import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Plus, Lock, Inbox } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { Gauge } from '../../../components/Gauge';
import { Row } from '../../../components/Row';
import { Sparkline } from '../../../components/Sparkline';
import { Async } from '../../../components/Async';
import { ModalShell } from '../../../components/ModalShell';
import { ConnectMailbox } from '../connect/ConnectMailbox';
import { useMailboxes, type Mailbox } from '../../../lib/data';
import { useMailboxPauseResume } from '../../../lib/mutations';
import { usePlan } from '../../../lib/usePlan';
import { useT } from '../../../lib/i18n';

function providerLabel(provider: string): string {
  if (provider === 'smtp') return 'SMTP';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function statusLabel(mailbox: Mailbox): string {
  if (mailbox.is_paused) return 'Paused';
  return mailbox.warmup_status.charAt(0).toUpperCase() + mailbox.warmup_status.slice(1);
}

function MailboxCard({ mailbox, delay }: { mailbox: Mailbox; delay: number }) {
  const t = useT();
  const pauseResume = useMailboxPauseResume();
  const initial = (mailbox.email_address[0] ?? '?').toUpperCase();
  const spark = mailbox.warmth_sparkline ?? [];
  const sent = mailbox.sent_today;
  const opens = mailbox.opens_today;

  return (
    <Animated.View entering={FadeInUp.duration(450).delay(delay)}>
      <Glass style={styles.card}>
        {/* Mailbox header row */}
        <View style={styles.mailboxHeader}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          {/* Email + subtitle */}
          <View style={styles.mailboxInfo}>
            <Text style={styles.mailboxEmail} numberOfLines={1}>
              {mailbox.email_address}
            </Text>
            <Text style={styles.mailboxSubtitle}>
              {statusLabel(mailbox)} · Day {mailbox.current_day} · {providerLabel(mailbox.provider)}
            </Text>
          </View>

          {/* Gauge */}
          <Gauge value={mailbox.warmth_score} size={64} color={wp.accent} />
        </View>

        {/* Sparkline */}
        {spark.length > 1 ? (
          <View style={styles.sparkWrap}>
            <Sparkline data={spark} color={wp.accent} height={48} />
          </View>
        ) : null}

        {/* Today's stats */}
        {sent != null || opens != null ? (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{sent ?? 0}</Text>
              <Text style={styles.statLabel}>{t('mbx.sentToday')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{opens ?? 0}</Text>
              <Text style={styles.statLabel}>{t('mbx.opensToday')}</Text>
            </View>
          </View>
        ) : null}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Manage row */}
        <Row
          icon={Settings}
          title={t('mbx.manage')}
          subtitle={mailbox.is_paused ? t('mbx.pausedTapResume') : t('mbx.activeTapPause')}
          onPress={() =>
            Alert.alert(mailbox.email_address, 'Manage this mailbox', [
              {
                text: mailbox.is_paused ? 'Resume warmup' : 'Pause warmup',
                onPress: () =>
                  pauseResume.mutate(
                    { id: mailbox.id, action: mailbox.is_paused ? 'resume' : 'pause' },
                    {
                      onSuccess: () =>
                        Alert.alert('Done', mailbox.is_paused ? 'Warmup resumed.' : 'Warmup paused.'),
                      onError: () =>
                        Alert.alert('Failed', 'Could not update this mailbox. Try again.'),
                    },
                  ),
              },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
          last
        />
      </Glass>
    </Animated.View>
  );
}

export function Mailboxes() {
  const t = useT();
  const q = useMailboxes();
  const { isStarter } = usePlan();
  const mailboxes = q.data ?? [];
  const count = mailboxes.length;
  const [adding, setAdding] = useState(false);

  // Starter is capped at a single mailbox; higher tiers add freely (backend
  // enforces the exact per-plan cap and surfaces an error if exceeded).
  const atStarterLimit = isStarter && count >= 1;

  const onAddPress = () => {
    if (atStarterLimit) {
      Alert.alert(
        'Mailbox limit reached',
        'The Starter plan includes 1 mailbox. Upgrade in Billing to connect more.',
      );
      return;
    }
    setAdding(true);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>
          {count} {t('mbx.connected')}
        </Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 }}>
          {count === 1 ? t('mbx.yourMailbox') : t('mbx.yourMailboxes')}
        </Text>
      </Animated.View>

      {/* Add mailbox */}
      <Animated.View entering={FadeInUp.duration(450).delay(40)}>
        <Pressable onPress={onAddPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginBottom: 16 })}>
          {atStarterLimit ? (
            <View style={styles.addLocked}>
              <Lock size={15} color={wp.textDim} strokeWidth={2} />
              <Text style={styles.addLockedText}>Upgrade to add more mailboxes</Text>
            </View>
          ) : (
            <LinearGradient colors={[wp.accent, wp.accentHover]} style={styles.addBtn}>
              <Plus size={16} color="#fff" strokeWidth={2.4} />
              <Text style={styles.addBtnText}>Add mailbox</Text>
            </LinearGradient>
          )}
        </Pressable>
      </Animated.View>

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={(q.data?.length ?? 0) === 0}
        emptyText={t('mbx.empty')}
        onRetry={q.refetch}
      >
        {mailboxes.map((mailbox, i) => (
          <MailboxCard key={mailbox.id} mailbox={mailbox} delay={80 + i * 80} />
        ))}
      </Async>

      <ModalShell visible={adding} onClose={() => setAdding(false)} icon={Inbox} title="Connect a mailbox" subtitle="Verify your app password — warmup starts within 15 minutes.">
        <View style={{ marginTop: 16 }}>
          <ConnectMailbox
            ctaLabel="Verify & connect"
            onConnected={() => {
              setAdding(false);
              Alert.alert('Mailbox connected', 'Warmup will start sending automatically.');
            }}
          />
        </View>
      </ModalShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  mailboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: hexA(wp.accent, 0.2),
    borderWidth: 1,
    borderColor: wp.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: wp.accent,
    fontSize: 14,
    fontFamily: fonts.mono,
  },
  mailboxInfo: {
    flex: 1,
  },
  mailboxEmail: {
    color: wp.text,
    fontSize: 15,
    fontFamily: fonts.sansSemibold,
    marginBottom: 2,
  },
  mailboxSubtitle: {
    color: wp.textDim,
    fontSize: 12,
    fontFamily: fonts.sans,
  },
  sparkWrap: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    color: wp.text,
    fontSize: 18,
    fontFamily: fonts.sansBold,
    marginBottom: 2,
  },
  statLabel: {
    color: wp.textDim,
    fontSize: 11,
    fontFamily: fonts.sans,
  },
  divider: {
    height: 1,
    backgroundColor: hexA(wp.border, 0.5),
    marginBottom: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fonts.sansSemibold,
  },
  addLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: wp.border,
    backgroundColor: 'rgba(18,18,18,0.5)',
  },
  addLockedText: {
    color: wp.textDim,
    fontSize: 13.5,
    fontFamily: fonts.sansSemibold,
  },
});
