import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, KeyRound, Loader2, PowerOff, RotateCcw } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogTrigger,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/AppToast';
import { useAdminSettings, useResetPeerPool, useRotateLlmKey, useToggleMaintenance } from './api';

interface DangerZonePanelProps {
  delay?: number;
}

interface DangerAction {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  confirmTitle: string;
  confirmBody: ReactNode;
  actionLabel: string;
  onConfirm: () => Promise<void> | void;
  pending: boolean;
}

interface ConfirmDialogProps {
  action: DangerAction;
}

function ConfirmDialog({ action }: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const canSubmit = confirmText === 'CONFIRM' && !action.pending;

  const reset = () => {
    setConfirmText('');
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(v) => {
        if (action.pending) return;
        setOpen(v);
        if (!v) reset();
      }}
    >
      <AppDialogTrigger asChild>
        <Button variant="danger" size="sm" leftIcon={action.icon}>
          {action.actionLabel}
        </Button>
      </AppDialogTrigger>
      <AppDialogContent>
        <AppDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-accent3" />
            <AppDialogTitle>{action.confirmTitle}</AppDialogTitle>
          </div>
          <AppDialogDescription>{action.confirmBody}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="space-y-2">
            <Label htmlFor={`confirm-${action.id}`}>
              Type <span className="font-mono text-accent3">CONFIRM</span> to enable the action.
            </Label>
            <Input
              id={`confirm-${action.id}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (action.pending) return;
              setOpen(false);
              reset();
            }}
            disabled={action.pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!canSubmit}
            leftIcon={
              action.pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                action.icon
              )
            }
            onClick={async () => {
              await action.onConfirm();
              setOpen(false);
              reset();
            }}
          >
            {action.pending ? 'Working…' : action.actionLabel}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function DangerZonePanel({ delay = 0 }: DangerZonePanelProps) {
  const { data } = useAdminSettings();
  const toggleMaintenance = useToggleMaintenance();
  const rotateKey = useRotateLlmKey();
  const resetPeer = useResetPeerPool();

  const maintenanceOn = Boolean(data?.danger?.maintenance_mode);

  const actions: DangerAction[] = [
    {
      id: 'maintenance',
      icon: <PowerOff className="h-3.5 w-3.5" />,
      title: maintenanceOn ? 'Leave maintenance mode' : 'Enter maintenance mode',
      description: maintenanceOn
        ? 'Resumes the API, Celery worker, and warmup cycles for all customers.'
        : 'Puts the API into read-only mode, pauses Celery workers and halts all outbound warmup sends.',
      confirmTitle: maintenanceOn ? 'Leave maintenance mode?' : 'Enter maintenance mode?',
      confirmBody: maintenanceOn
        ? 'Customers will see live data again and warmup cycles will resume on the next beat tick.'
        : 'Every customer will see a banner and outbound warmup sends will halt until this is toggled off.',
      actionLabel: maintenanceOn ? 'Leave maintenance' : 'Enter maintenance',
      pending: toggleMaintenance.isPending,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          toggleMaintenance.mutate(!maintenanceOn, {
            onSuccess: () => {
              toast.success(
                maintenanceOn ? 'Maintenance mode disabled' : 'Maintenance mode enabled',
              );
              resolve();
            },
            onError: () => {
              toast.error('Failed to toggle maintenance mode');
              resolve();
            },
          });
        }),
    },
    {
      id: 'rotate-llm',
      icon: <KeyRound className="h-3.5 w-3.5" />,
      title: 'Rotate  API key',
      description:
        'Generates a new key on , replaces the encrypted key in the DB, and invalidates pending jobs.',
      confirmTitle: 'Rotate the  API key?',
      confirmBody:
        'In-flight content generations will be cancelled and retried with the new key. There is no rollback — be sure  is reachable before confirming.',
      actionLabel: 'Rotate key',
      pending: rotateKey.isPending,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          rotateKey.mutate(undefined, {
            onSuccess: () => {
              toast.success(' key rotated');
              resolve();
            },
            onError: () => {
              toast.error('Key rotation failed');
              resolve();
            },
          });
        }),
    },
    {
      id: 'reset-peer',
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      title: 'Reset helper-group health counters',
      description:
        'Zeroes trust scores, send counters, and last-used timestamps on every helper inbox.',
      confirmTitle: 'Reset helper-group health counters?',
      confirmBody:
        'This recalibrates routing weights across the entire helper network. Group assignments stay intact but metrics restart from zero.',
      actionLabel: 'Reset counters',
      pending: resetPeer.isPending,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          resetPeer.mutate(undefined, {
            onSuccess: () => {
              toast.success('Helper-group counters reset');
              resolve();
            },
            onError: () => {
              toast.error('Reset failed');
              resolve();
            },
          });
        }),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="border-accent3/40 bg-accent3/5">
        <div className="flex items-start justify-between gap-3 border-b border-accent3/30 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent3" />
              <h3 className="text-base font-semibold text-accent3">Danger zone</h3>
            </div>
            <p className="mt-1 text-xs text-text-dim">
              Destructive, account-wide operations. Each action requires typing CONFIRM before it
              can be submitted.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-accent3/20">
          {actions.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-text">{a.title}</h4>
                <p className="mt-0.5 text-xs text-text-dim">{a.description}</p>
              </div>
              <div className="shrink-0">
                <ConfirmDialog action={a} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  );
}
