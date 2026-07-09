import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';
import { Megaphone, Trophy, Users } from 'lucide-react';
import { useCrmSummary } from '../api';
import { CRM_STAGES, crmStageColor } from '../types';
import { formatNumber } from '@/lib/format';

/**
 * Animate a number from 0 → `value` once on mount / whenever value changes.
 * Returns the current (rounded) display number.
 */
function useCountUp(value: number, durationSec = 0.9): number {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: durationSec,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, durationSec]);
  return display;
}

/**
 * Row of CRM stat tiles fed by `/crm/summary`: campaigns, total leads, won
 * value, plus a compact by-stage distribution bar. Numbers count up on mount.
 */
export function CrmSummaryStats() {
  const summaryQuery = useCrmSummary();
  const summary = summaryQuery.data;

  const campaigns = summary?.campaigns ?? 0;
  const leads = summary?.leads ?? 0;
  const wonDollars = Math.round((summary?.won_value_cents ?? 0) / 100);
  const byStage = summary?.by_stage ?? {};

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={<Megaphone className="h-4 w-4" strokeWidth={2.2} />}
        label="Campaigns"
        value={campaigns}
      />
      <StatTile
        icon={<Users className="h-4 w-4" strokeWidth={2.2} />}
        label="Total leads"
        value={leads}
      />
      <StatTile
        icon={<Trophy className="h-4 w-4" strokeWidth={2.2} />}
        label="Won value"
        value={wonDollars}
        prefix="$"
        tone="var(--wp-success, #3ddc97)"
      />
      <StageBar byStage={byStage} total={leads} />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  prefix,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prefix?: string;
  tone?: string;
}) {
  const display = useCountUp(value);
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            color: tone ?? 'var(--wp-accent, #F26522)',
            background: 'color-mix(in srgb, currentColor 12%, transparent)',
          }}
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-text-dim">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">
        {prefix}
        {formatNumber(Math.round(display))}
      </p>
    </div>
  );
}

function StageBar({
  byStage,
  total,
}: {
  byStage: Record<string, number>;
  total: number;
}) {
  const segments = CRM_STAGES.map((meta) => ({
    meta,
    count: byStage[meta.key] ?? 0,
  })).filter((s) => s.count > 0);

  return (
    <div className="col-span-2 rounded-2xl border border-border-muted bg-surface p-4 lg:col-span-1">
      <span className="text-xs font-medium text-text-dim">By stage</span>
      {total > 0 ? (
        <>
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            {segments.map(({ meta, count }) => (
              <div
                key={meta.key}
                style={{
                  width: `${(count / total) * 100}%`,
                  background: crmStageColor(meta.key),
                }}
                title={`${meta.label}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
            {segments.map(({ meta, count }) => (
              <span key={meta.key} className="inline-flex items-center gap-1 text-[10px] text-text-dim">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: crmStageColor(meta.key) }}
                  aria-hidden
                />
                {meta.label} {count}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs italic text-text-faint">No leads yet.</p>
      )}
    </div>
  );
}
