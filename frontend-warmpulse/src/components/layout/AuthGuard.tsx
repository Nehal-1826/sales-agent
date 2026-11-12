import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore, type UserRole } from '@/stores/auth';

interface AuthGuardProps {
  children: ReactNode;
  /** If set, requires the current user to have this role. */
  requireRole?: UserRole;
}

/**
 * Route guard. If no accessToken, redirects to /login with a `from` return-to.
 * If `requireRole` is set, redirects mismatched users to their own root.
 */
export function AuthGuard({ children, requireRole }: AuthGuardProps) {
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireRole && user && user.role !== requireRole) {
    const fallback = user.role === 'super_admin' ? '/admin/dashboard' : '/app/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
