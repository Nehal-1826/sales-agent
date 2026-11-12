import { motion } from 'framer-motion';
import { MailOpen, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTodayStats } from '@/features/dashboard/api';

const TILES: Array<{
  key: 'sent' | 'opens' | 'replies' | 'spam_rescues';
  label: string;
  icon: typeof Send;
  accent: string;
}> = [
  { key: 'sent', label: 'Sent today', icon: Send, accent: 'text-accent2' },
  { key: 'opens', label: 'Opens', icon: MailOpen, accent: 'text-accent' },
  { key: 'replies', label: 'Replies', icon: MessageSquare, accent: 'text-accent4' },
  {
    key: 'spam_rescues',
    label: 'Spam rescues',
    icon: ShieldCheck,
    accent: 'text-accent',
  },
];

export function TodayStats() {
  const { data, isLoading } = useTodayStats();

  return (
    <Card className="h-full">
      <CardContent className="grid h-full grid-cols-2 gap-3 p-4 sm:grid-cols-4 xl:grid-cols-2">
        {TILES.map((tile, idx) => {
          const Icon = tile.icon;
          const value = data ? data[tile.key] : 0;
          return (
            <motion.div
              key={tile.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
              className="flex flex-col gap-1 rounded-lg border border-border-muted bg-surface-2/30 p-3"
            >
              <div className="flex items-center justify-between text-xs text-text-dim">
                <span>{tile.label}</span>
                <Icon className={`h-4 w-4 ${tile.accent}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums text-text">{value}</p>
              )}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
