import { Check, X, HelpCircle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { DomainHealth } from '@/features/reputation/types';
import { warmthColor } from '@/components/charts/theme';

interface DomainHealthCardProps {
  domain: DomainHealth;
}

function StatusPill({ label, value }: { label: string; value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
        <Check className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[11px] font-medium text-accent3">
        <X className="h-3 w-3" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-dim">
      <HelpCircle className="h-3 w-3" /> {label}
    </span>
  );
}

export function DomainHealthCard({ domain }: DomainHealthCardProps) {
  const score = domain.reputation_score ?? 0;
  const color = warmthColor(score);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-text-dim" />
              <p className="truncate font-mono text-sm text-text">{domain.domain}</p>
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-text-dim">
              Domain health
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
              {score}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-text-dim">Sender trust</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StatusPill label="SPF" value={domain.spf_valid} />
          <StatusPill label="DKIM" value={domain.dkim_valid} />
          <StatusPill label="DMARC" value={domain.dmarc_valid} />
        </div>

        {domain.blacklist_hits.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {domain.blacklist_hits.map((bl) => (
              <Badge key={bl} variant="orange">
                {bl}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-text-dim">No block list hits</p>
        )}
      </CardContent>
    </Card>
  );
}
