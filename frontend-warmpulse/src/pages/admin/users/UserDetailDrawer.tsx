import { useAdminUserAvatar, useAdminUserDetail } from '@/features/admin/api';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
} from '@/components/ui/AppDialog';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

function initials(s: string): string {
  return (
    s
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

function avatarBg(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 56%), hsl(${(h + 40) % 360} 65% 48%))`;
}

function DrawerAvatar({
  userId,
  email,
  name,
  hasAvatar,
}: {
  userId: string;
  email: string;
  name: string | null;
  hasAvatar: boolean;
}) {
  const url = useAdminUserAvatar(userId, hasAvatar);
  const size = { width: 48, height: 48, borderRadius: '50%' as const };
  if (hasAvatar && url) {
    return <img src={url} alt="" style={{ ...size, objectFit: 'cover' }} />;
  }
  return (
    <span
      aria-hidden
      style={{
        ...size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        background: avatarBg(email),
      }}
    >
      {initials(name ?? email)}
    </span>
  );
}

interface UserDetailDrawerProps {
  userId: string | null;
  onClose: () => void;
}

export function UserDetailDrawer({ userId, onClose }: UserDetailDrawerProps) {
  const { data, isLoading } = useAdminUserDetail(userId);

  return (
    <AppDialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <div className="flex items-center gap-3">
            {data ? (
              <DrawerAvatar
                userId={data.id}
                email={data.email}
                name={data.name ?? null}
                hasAvatar={!!data.avatar_url}
              />
            ) : null}
            <div>
              <AppDialogTitle>{data?.email ?? 'User detail'}</AppDialogTitle>
              <AppDialogDescription>
                Workspace-level information, plan, and mailbox summary.
              </AppDialogDescription>
            </div>
          </div>
        </AppDialogHeader>
        <AppDialogBody>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !data ? (
            <p className="text-sm text-text-dim">No detail endpoint available yet.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-text-dim">Plan</dt>
                <dd className="text-text">{data.plan}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-dim">Status</dt>
                <dd>
                  <Badge variant={data.status === 'active' ? 'green' : 'orange'}>
                    {data.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-dim">Mailboxes</dt>
                <dd className="text-text">{data.mailbox_count}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-dim">Joined</dt>
                <dd className="text-text">
                  {new Date(data.joined_at).toLocaleDateString()}
                </dd>
              </div>
              {data.last_seen_at ? (
                <div>
                  <dt className="text-xs text-text-dim">Last seen</dt>
                  <dd className="text-text">
                    {new Date(data.last_seen_at).toLocaleString()}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
  );
}
