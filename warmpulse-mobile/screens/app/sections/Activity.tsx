import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { ComponentType } from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Send, MailOpen, Reply, Star, ShieldCheck, Flag, Activity as ActivityIcon } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { Async } from '../../../components/Async';
import { useActivity, type ActivityItem } from '../../../lib/data';
import { useT } from '../../../lib/i18n';

const FILTER_CHIPS = ['All', 'Sent', 'Opened', 'Replied', 'Starred', 'Rescued'] as const;
type FilterChip = typeof FILTER_CHIPS[number];

type ActionMeta = {
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
  /** true when the peer engages the user's mailbox (peer → mailbox) */
  inbound: boolean;
};

const ACTIONS: Record<string, ActionMeta> = {
  sent:            { Icon: Send,        color: wp.accent,  label: 'Sent',              inbound: false },
  opened:          { Icon: MailOpen,    color: wp.accent2, label: 'Opened',            inbound: true },
  replied:         { Icon: Reply,       color: wp.success, label: 'Replied',           inbound: true },
  starred:         { Icon: Star,        color: wp.warning, label: 'Starred',           inbound: true },
  spam_rescued:    { Icon: ShieldCheck, color: wp.danger,  label: 'Rescued from spam', inbound: true },
  marked_important:{ Icon: Flag,        color: wp.accent2, label: 'Marked important',  inbound: true },
};

const FALLBACK_META: ActionMeta = { Icon: ActivityIcon, color: wp.accent, label: 'Activity', inbound: false };

const chipToAction: Record<FilterChip, string | null> = {
  All:     null,
  Sent:    'sent',
  Opened:  'opened',
  Replied: 'replied',
  Starred: 'starred',
  Rescued: 'spam_rescued',
};

function shortTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Activity() {
  const t = useT();
  const [active, setActive] = useState<FilterChip>('All');
  const q = useActivity(50);

  const CHIP_LABELS: Record<FilterChip, string> = {
    All: t('act.chipAll'),
    Sent: t('act.chipSent'),
    Opened: t('act.chipOpened'),
    Replied: t('act.chipReplied'),
    Starred: t('act.chipStarred'),
    Rescued: t('act.chipRescued'),
  };

  const VERB_LABELS: Record<string, string> = {
    sent: t('act.verbSent'),
    opened: t('act.verbOpened'),
    replied: t('act.verbReplied'),
    starred: t('act.verbStarred'),
    spam_rescued: t('act.verbRescued'),
    marked_important: t('act.verbImportant'),
  };

  const items: ActivityItem[] = q.data ?? [];
  const wantAction = chipToAction[active];
  const filtered = wantAction === null
    ? items
    : items.filter(e => e.action === wantAction);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>{t('act.eyebrow')}</Text>
        <Text style={styles.heading}>{t('act.heading')}</Text>
      </Animated.View>

      {/* Filter chips */}
      <Animated.View entering={FadeInUp.duration(450).delay(80)} style={styles.chipsRow}>
        {FILTER_CHIPS.map(chip => {
          const isActive = chip === active;
          return (
            <Pressable
              key={chip}
              onPress={() => setActive(chip)}
              style={[
                styles.chip,
                isActive
                  ? { backgroundColor: wp.accent, borderColor: wp.accent }
                  : { backgroundColor: 'transparent', borderColor: wp.border },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? '#ffffff' : wp.textDim },
                ]}
              >
                {CHIP_LABELS[chip]}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* Feed */}
      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Async
          loading={q.isLoading}
          error={q.isError}
          isEmpty={(q.data?.length ?? 0) === 0}
          emptyText={t('act.empty')}
          onRetry={q.refetch}
        >
          <Glass style={styles.feedCard}>
            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>{t('act.noEvents')}</Text>
            ) : (
              filtered.map((event, index) => {
                const meta = ACTIONS[event.action] ?? FALLBACK_META;
                const { Icon, color, inbound } = meta;
                const label = VERB_LABELS[event.action] ?? t('act.verbActivity');
                const isError = event.result === 'error';
                const tint = isError ? wp.danger : color;
                const route = inbound
                  ? `${event.peer_email} → ${event.mailbox_email}`
                  : `${event.mailbox_email} → ${event.peer_email}`;
                const isLast = index === filtered.length - 1;
                return (
                  <View
                    key={event.id}
                    style={[styles.feedRow, !isLast && styles.feedRowBorder]}
                  >
                    {/* Icon chip */}
                    <View
                      style={[
                        styles.iconChip,
                        {
                          backgroundColor: hexA(tint, 0.14),
                          borderColor: tint,
                        },
                      ]}
                    >
                      <Icon size={14} color={tint} strokeWidth={2} />
                    </View>

                    {/* Text */}
                    <View style={styles.feedTextBlock}>
                      <Text style={[styles.feedVerb, isError && { color: wp.danger }]}>
                        {label}
                        {isError ? t('act.failedSuffix') : ''}
                      </Text>
                      <Text style={styles.feedPeer} numberOfLines={1}>
                        {route}
                      </Text>
                      {event.subject ? (
                        <Text style={styles.feedSubject} numberOfLines={1}>
                          {event.subject}
                        </Text>
                      ) : null}
                    </View>

                    {/* Time */}
                    <Text style={styles.feedTime}>{shortTime(event.ts)}</Text>
                  </View>
                );
              })
            )}
          </Glass>
        </Async>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: wp.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: fonts.monoBold,
    marginBottom: 6,
  },
  heading: {
    color: wp.text,
    fontSize: 24,
    fontFamily: fonts.sansBold,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.sansSemibold,
  },
  feedCard: {
    padding: 0,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  feedRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: wp.border,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  feedTextBlock: {
    flex: 1,
  },
  feedVerb: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: wp.text,
  },
  feedPeer: {
    color: wp.textDim,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  feedSubject: {
    color: wp.textFaint,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  feedTime: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: wp.textFaint,
    flexShrink: 0,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: wp.textFaint,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
});
