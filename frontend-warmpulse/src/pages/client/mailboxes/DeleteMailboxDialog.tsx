import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useDeleteMailbox } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';

interface DeleteMailboxDialogProps {
  mailbox: Mailbox | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteMailboxDialog({ mailbox, onClose, onDeleted }: DeleteMailboxDialogProps) {
  const del = useDeleteMailbox();
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (mailbox) setConfirm('');
  }, [mailbox]);

  const canSubmit = !!mailbox && confirm.trim() === mailbox.email_address;

  const onConfirm = () => {
    if (!mailbox || !canSubmit) return;
    del.mutate(mailbox.id, {
      onSuccess: () => {
        toast.success('Mailbox deleted');
        onDeleted?.();
        onClose();
      },
      onError: () => toast.error('Failed to delete'),
    });
  };

  return (
    <AppDialog open={!!mailbox} onOpenChange={(n) => (n ? null : onClose())}>
      <AppDialogContent className="max-w-md">
        <AppDialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent3/10 text-accent3">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <AppDialogTitle>Delete mailbox?</AppDialogTitle>
          <p className="text-sm text-text-dim">
            This permanently removes the mailbox and all warmup history. This cannot be undone.
          </p>
        </AppDialogHeader>
        <AppDialogBody>
          <p className="text-xs text-text-dim">
            Type <span className="font-mono text-text">{mailbox?.email_address}</span> below to
            confirm.
          </p>
          <FormField htmlFor="confirm-email">
            <Input
              id="confirm-email"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={mailbox?.email_address}
              autoComplete="off"
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={!canSubmit || del.isPending}
            leftIcon={
              del.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )
            }
          >
            {del.isPending ? 'Deleting…' : 'Delete mailbox'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
