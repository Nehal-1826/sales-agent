/**
 * Small pieces shared by the console's Users page (AdminUsersPage) and its
 * user panel (UserDrawer): the plain-word labels of a real account, its
 * status chip and the date helpers.
 */
import { Chip } from '../../components/ui';
import type { AccountRow } from '../../lib/platform';

export type AccountStatus = AccountRow['status'];
export type AccountRole = AccountRow['role'];

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Turned off',
  pending: 'Not verified yet',
  deleted: 'Deleted',
};

/** The status buttons of the filter row, in order. "Deleted" comes last: a
 *  deleted account is listed only under it, never among the others. */
export const STATUS_FILTERS: AccountStatus[] = ['active', 'suspended', 'pending', 'deleted'];

export const ROLE_LABELS: Record<AccountRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  platform_admin: 'Platform admin',
};

/** An account and its warmup copy are the same person when their emails match this way. */
export const emailKey = (email: string): string => email.trim().toLowerCase();

/** The person's name, or their username when no name was given. */
export const displayName = (account: Pick<AccountRow, 'name' | 'username' | 'email'>): string =>
  account.name.trim() || account.username || account.email;

export function isPlatformAdmin(account: Pick<AccountRow, 'role' | 'is_platform_admin'>): boolean {
  return account.is_platform_admin || account.role === 'platform_admin';
}

export function initials(s: string): string {
  return (
    s
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => (p[0] ?? '').toUpperCase())
      .join('') || '?'
  );
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 120) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const mos = Math.floor(days / 30);
  return `${mos} mo${mos === 1 ? '' : 's'} ago`;
}

export const when = (s?: string | null): string => (s ? new Date(s).toLocaleDateString() : '—');

/**
 * The status chip. `Chip` has no danger tone and its stylesheet is shared
 * with the whole app, so the deleted status wears the danger colours itself
 * (the three tokens `.btn-danger` and `.pf-error` use).
 */
export function StatusChip({ status }: { status: AccountStatus }) {
  if (status === 'deleted') {
    return (
      <span
        className="chip chip-neutral"
        style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger-border)', color: 'var(--danger-ink)' }}
      >
        {STATUS_LABELS.deleted}
      </span>
    );
  }
  return <Chip tone={status === 'active' ? 'success' : status === 'suspended' ? 'warn' : 'neutral'}>{STATUS_LABELS[status]}</Chip>;
}
