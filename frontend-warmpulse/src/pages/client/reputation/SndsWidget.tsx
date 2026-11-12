import { ExternalLink, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/AppToast';
import { useSndsStatus } from '@/features/reputation/api';

/** Microsoft SNDS widget. Mirrors `PostmasterWidget` — placeholder for MVP. */
export function SndsWidget() {
  const status = useSndsStatus();

  if (status.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Microsoft SNDS</CardTitle>
          <CardDescription>IP trust data from Outlook / Hotmail.</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const connected = status.data?.connected ?? false;

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-text-dim" /> Microsoft SNDS
          </CardTitle>
          <CardDescription>
            Connect Microsoft SNDS to see IP trust, complaint rates, and trap hits for
            Outlook/Hotmail inbox delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-dashed border-border-muted bg-surface-2/40 p-4 text-xs text-text-dim">
            No SNDS data yet — once connected, per-IP status (green/yellow/red), complaint rate,
            and trap hits will appear here.
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => {
              window.open(
                'https://sendersupport.olc.protection.outlook.com/snds/',
                '_blank',
                'noopener,noreferrer',
              );
              toast.info(
                'Opening Microsoft SNDS — request access for your IPs, then we\'ll start syncing automatically.',
              );
            }}
            title="Open Microsoft SNDS in a new tab"
          >
            Connect Microsoft SNDS
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4 text-accent" /> Microsoft SNDS
        </CardTitle>
        <CardDescription>
          {status.data?.ips_tracked ?? 0} IPs tracked
          {status.data?.last_sync_at ? ` · last sync ${status.data.last_sync_at}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-dim">
          SNDS details render here once the integration is live.
        </p>
      </CardContent>
    </Card>
  );
}
