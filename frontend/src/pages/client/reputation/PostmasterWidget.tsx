import { ExternalLink, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/AppToast';
import { usePostmasterStatus } from '@/features/reputation/api';

/**
 * Google Postmaster Tools widget. The live integration lands in a later phase,
 * so until `connected` is true we render a placeholder with a disabled CTA.
 */
export function PostmasterWidget() {
  const status = usePostmasterStatus();

  if (status.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Postmaster Tools</CardTitle>
          <CardDescription>Sender trust & inbox delivery signals from Gmail.</CardDescription>
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
            <Mail className="h-4 w-4 text-text-dim" /> Google Postmaster Tools
          </CardTitle>
          <CardDescription>
            Connect Google Postmaster Tools to see sender trust, IP/domain inbox delivery, and
            spam rate data from Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-dashed border-border-muted bg-surface-2/40 p-4 text-xs text-text-dim">
            No Postmaster data yet — once connected, domain trust, IP trust, spam rate
            and feedback-loop rate will appear here.
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => {
              window.open('https://postmaster.google.com/', '_blank', 'noopener,noreferrer');
              toast.info(
                'Opening Postmaster Tools — verify your domain there, then we\'ll start syncing automatically.',
              );
            }}
            title="Open Google Postmaster Tools in a new tab"
          >
            Connect Postmaster
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent" /> Google Postmaster Tools
        </CardTitle>
        <CardDescription>
          {status.data?.domains_tracked ?? 0} domains tracked
          {status.data?.last_sync_at ? ` · last sync ${status.data.last_sync_at}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-dim">
          Detailed Postmaster breakdown will render here once the integration is live.
        </p>
      </CardContent>
    </Card>
  );
}
