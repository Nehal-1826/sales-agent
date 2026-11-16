import type { WarmupTodayStats } from '../../lib/warmupApi';

/** Today's counters — the four tiles the source dashboard showed. */
const TILES: Array<{ key: keyof Pick<WarmupTodayStats, 'sent' | 'opens' | 'replies' | 'spam_rescues'>; label: string }> = [
  { key: 'sent', label: 'Sent today' },
  { key: 'opens', label: 'Opens' },
  { key: 'replies', label: 'Replies' },
  { key: 'spam_rescues', label: 'Spam rescues' },
];

/** Four counter tiles for today's warmup activity (port of source TodayStats). */
export function TodayStats({ stats }: { stats: WarmupTodayStats }) {
  return (
    <div className="warmup-today">
      {TILES.map((tile) => (
        <div key={tile.key} className="warmup-tile">
          <span className="warmup-tile-label">{tile.label}</span>
          <span className="warmup-tile-value">{stats[tile.key]}</span>
        </div>
      ))}
    </div>
  );
}
