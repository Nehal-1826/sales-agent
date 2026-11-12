import { Mail, MailOpen, Reply as ReplyIcon, ShieldAlert, Star } from 'lucide-react';
import type { DemoEvent } from '../pro-dashboards/demoData';

/**
 * Shared visual primitives for the 6 Pro Activity variants.
 * All colors come from admin tokens.
 */

export const ACTION_META: Record<
  DemoEvent['action'],
  { label: string; tone: string; Icon: typeof Mail }
> = {
  sent: { label: 'sent', tone: 'send', Icon: Mail },
  opened: { label: 'opened', tone: 'open', Icon: MailOpen },
  replied: { label: 'replied', tone: 'reply', Icon: ReplyIcon },
  starred: { label: 'starred', tone: 'star', Icon: Star },
  spam_rescued: { label: 'rescued', tone: 'rescue', Icon: ShieldAlert },
};

export function ActionChip({
  action,
  compact,
}: {
  action: DemoEvent['action'];
  compact?: boolean;
}) {
  const meta = ACTION_META[action];
  const Icon = meta.Icon;
  return (
    <span className={`ac-chip ac-chip--${meta.tone} ${compact ? 'ac-chip--compact' : ''}`}>
      <Icon size={compact ? 9 : 10} strokeWidth={2.6} />
      {meta.label}
    </span>
  );
}

export function ActionDot({ action }: { action: DemoEvent['action'] }) {
  const tone = ACTION_META[action].tone;
  return <span className={`ac-dot ac-dot--${tone}`} />;
}
