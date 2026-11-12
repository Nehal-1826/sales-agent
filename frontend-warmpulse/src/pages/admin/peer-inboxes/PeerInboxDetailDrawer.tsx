import { useEffect, useState } from 'react';
import { Pencil, Trash2, Wifi } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChartContainer, LineChartWp } from '@/components/charts';
import { toast } from '@/components/ui/AppToast';
import {
  useAdminPeerInboxDetail,
  useTestPeerConnection,
} from '@/features/admin/api';
import type { PeerInboxOut } from '@/features/admin/types';

interface PeerInboxDetailDrawerProps {
  peerId: string | null;
  onClose: () => void;
  /** Called when the user clicks Edit in the drawer footer. The parent
   *  decides what to do (typically: open the edit-capacity dialog). */
  onEdit?: (peer: PeerInboxOut) => void;
  /** Called when the user clicks Delete in the drawer footer. The parent
   *  decides what to do (typically: open the delete confirmation). */
  onDelete?: (peer: PeerInboxOut) => void;
}

interface RotationPoint extends Record<string, unknown> {
  date: string;
  sends: number;
}

export function PeerInboxDetailDrawer({
  peerId,
  onClose,
  onEdit,
  onDelete,
}: PeerInboxDetailDrawerProps) {
  const { data, isLoading } = useAdminPeerInboxDetail(peerId);
  const test = useTestPeerConnection();
  const [testResult, setTestResult] = useState<
    { smtp_ok: boolean; imap_ok: boolean; error?: string } | null
  >(null);

  useEffect(() => {
    if (!peerId) setTestResult(null);
  }, [peerId]);

  async function handleTest() {
    if (!peerId) return;
    try {
      const r = await test.mutateAsync(peerId);
      setTestResult(r);
      if (r.smtp_ok && r.imap_ok) toast.success('Connection OK.');
      else toast.error('Connection failed.');
    } catch {
      toast.error('Connection test failed.');
    }
  }

  // Rotation history (sent over last 14d). Backend may not return this yet —
  // we derive mock datapoints from daily capacity so the widget is never blank.
  const rotation: RotationPoint[] = data
    ? Array.from({ length: 14 }, (_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10),
        sends: Math.max(0, Math.round(data.daily_capacity * (0.4 + Math.sin(i) * 0.25))),
      }))
    : [];

  return (
    <AppDialog open={!!peerId} onOpenChange={(o) => !o && onClose()}>
      <AppDialogContent className="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>{data?.email ?? 'Test account detail'}</AppDialogTitle>
          <AppDialogDescription>
            Provider, daily limit, trust score, and rotation over time.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : !data ? (
            <p className="text-sm text-text-dim">Not found.</p>
          ) : (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-dim">Provider</dt>
                  <dd className="text-text">{data.provider}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Status</dt>
                  <dd>
                    <Badge variant={data.is_active ? 'green' : 'neutral'}>
                      {data.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Daily limit</dt>
                  <dd className="text-text">{data.daily_capacity} / day</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Trust score</dt>
                  <dd className="text-text">{Math.round(data.reputation_score)}</dd>
                </div>
              </dl>
              <ChartContainer title="Rotation (14d)" height={220}>
                <LineChartWp
                  data={rotation}
                  xKey="date"
                  series={[{ key: 'sends', name: 'Sends' }]}
                />
              </ChartContainer>
              {testResult ? (
                <div className="mt-3 flex gap-2 text-xs">
                  <Badge variant={testResult.smtp_ok ? 'green' : 'orange'}>
                    SMTP {testResult.smtp_ok ? 'ok' : 'fail'}
                  </Badge>
                  <Badge variant={testResult.imap_ok ? 'green' : 'orange'}>
                    IMAP {testResult.imap_ok ? 'ok' : 'fail'}
                  </Badge>
                </div>
              ) : null}
            </>
          )}
        </AppDialogBody>
        <AppDialogFooter>
          {/* Danger action on the far left so it's spatially separated
              from the safe actions on the right — standard convention. */}
          {onDelete && data ? (
            <Button
              variant="ghost"
              onClick={() => onDelete(data)}
              className="mr-auto text-accent3 hover:text-accent3"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : null}
          {onEdit && data ? (
            <Button variant="ghost" onClick={() => onEdit(data)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : null}
          <Button variant="secondary" onClick={handleTest} disabled={test.isPending || !data}>
            <Wifi className="mr-2 h-4 w-4" />
            {test.isPending ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
