import type { ReactNode } from 'react';
import { Building2, KeyRound, Layers, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useWorkspace, type WorkspacePlan } from './api';

const PLAN_VARIANT: Record<WorkspacePlan, 'green' | 'blue' | 'orange' | 'neutral' | 'yellow'> = {
  free: 'neutral',
  starter: 'blue',
  pro: 'green',
  pro_plus: 'yellow',
  agency: 'orange',
};

export function WorkspaceOverview() {
  const { data, isLoading, isError } = useWorkspace();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load workspace"
        description="Try refreshing. If the issue persists, contact support."
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No workspace yet"
        description="Once you join or create a workspace, it shows up here."
      />
    );
  }

  const memberCount = data.team_members.length;
  const subClientCount = data.sub_clients.length;
  const activeKeyCount = data.api_keys.filter((k) => !k.revoked_at).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-accent">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dim">Workspace</p>
              <h3 className="text-lg font-semibold text-text">{data.name || 'Untitled workspace'}</h3>
            </div>
          </div>
          <Badge variant={PLAN_VARIANT[data.plan] ?? 'neutral'} className="self-start md:self-auto">
            {data.plan.toUpperCase()} plan
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Team members"
          value={memberCount}
          hint={`${data.team_members.filter((m) => !m.accepted_at).length} pending`}
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="Sub-clients"
          value={subClientCount}
          hint={data.plan === 'agency' ? 'Agency feature' : 'Upgrade to Agency'}
          dimmed={data.plan !== 'agency'}
        />
        <StatCard
          icon={<KeyRound className="h-4 w-4" />}
          label="Active API keys"
          value={activeKeyCount}
          hint={`${data.api_keys.length - activeKeyCount} revoked`}
          dimmed={data.plan !== 'agency'}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  dimmed,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: string;
  dimmed?: boolean;
}) {
  return (
    <Card className={cn(dimmed && 'opacity-80')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-text-dim">
          <span className="text-accent">{icon}</span>
          <p className="text-xs uppercase tracking-wider">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{value}</p>
        {hint ? <p className="text-xs text-text-dim">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
