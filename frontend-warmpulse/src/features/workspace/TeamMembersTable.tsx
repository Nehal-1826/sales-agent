import { useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { formatDate as _fmtDate } from '@/lib/format';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import {
  useInviteMember,
  useRemoveMember,
  useWorkspace,
  type TeamMember,
  type TeamRole,
} from './api';

const ROLE_VARIANT: Record<TeamRole, BadgeVariant> = {
  owner: 'orange',
  admin: 'blue',
  member: 'neutral',
};

export function TeamMembersTable() {
  const { data, isLoading, isError } = useWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);

  // When the team_members list is empty the current user is the only member
  // of their workspace — i.e. the owner — so invite must be allowed. Without
  // this short-circuit the empty-state's "Invite teammate" button never
  // appeared, even though that's the most important moment to show it.
  const canInviteMe =
    !data ||
    data.team_members.length === 0 ||
    data.team_members.some(
      (m) => m.can_invite || m.role === 'owner' || m.role === 'admin',
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Team members</CardTitle>
            <CardDescription>
              Invite teammates and grant access to your workspace.
            </CardDescription>
          </div>
          {canInviteMe ? (
            <Button
              size="sm"
              leftIcon={<UserPlus className="h-4 w-4" />}
              onClick={() => setInviteOpen(true)}
            >
              Invite
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load team"
              description="Try refreshing. If the issue persists, contact support."
            />
          </div>
        ) : !data?.team_members.length ? (
          <div className="p-5">
            <EmptyState
              title="No team members yet"
              description="You're flying solo. Invite your teammates to collaborate."
              action={
                canInviteMe ? (
                  <Button
                    leftIcon={<UserPlus className="h-4 w-4" />}
                    onClick={() => setInviteOpen(true)}
                  >
                    Invite teammate
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <MembersTable members={data.team_members} canManage={canInviteMe} />
        )}
      </CardContent>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  );
}

function MembersTable({ members, canManage }: { members: TeamMember[]; canManage: boolean }) {
  const remove = useRemoveMember();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="bg-surface-2/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Invited</th>
            <th className="px-4 py-2">Accepted</th>
            {canManage ? <th className="px-4 py-2 text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {members.map((m) => (
            <tr key={m.id} className="text-sm">
              <td className="px-4 py-2 font-medium">{m.email}</td>
              <td className="px-4 py-2">
                <Badge variant={ROLE_VARIANT[m.role]}>{m.role}</Badge>
              </td>
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {formatDate(m.invited_at)}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {m.accepted_at ? (
                  <span className="text-text-dim">{formatDate(m.accepted_at)}</span>
                ) : (
                  <Badge variant="yellow">Pending</Badge>
                )}
              </td>
              {canManage ? (
                <td className="px-4 py-2 text-right">
                  {m.role === 'owner' ? (
                    <span className="text-xs text-text-dim">—</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Remove team member?',
                          description: `${m.email} will lose access to the workspace immediately.`,
                          confirmLabel: 'Remove',
                          danger: true,
                        });
                        if (!ok) return;
                        remove.mutate(m.id, {
                          onSuccess: () => toast.success('Member removed'),
                          onError: (err) => toast.error(extractErrorMessage(err, 'Failed to remove')),
                        });
                      }}
                      aria-label={`Remove ${m.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const invite = useInviteMember();

  const reset = () => {
    setEmail('');
    setRole('member');
    invite.reset();
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = () => {
    if (!email.includes('@')) return;
    invite.mutate(
      { email, role },
      {
        onSuccess: () => {
          toast.success(`Invited ${email}`);
          handleClose(false);
        },
        onError: () => toast.error('Failed to send invite'),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={handleClose}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Invite a teammate</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <FormField label="Email" htmlFor="inv-email" required>
            <Input
              id="inv-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField label="Role" htmlFor="inv-role">
            <AppSelect value={role} onValueChange={(v) => setRole(v as TeamRole)}>
              <AppSelectTrigger id="inv-role">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="admin">Admin — can manage team & billing</AppSelectItem>
                <AppSelectItem value="member">Member — can use warmup tools</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={invite.isPending || !email.includes('@')}
            leftIcon={invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {invite.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function formatDate(iso: string): string {
  try {
    return _fmtDate(iso);
  } catch {
    return iso;
  }
}
