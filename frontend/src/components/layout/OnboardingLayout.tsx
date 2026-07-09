import { Link, Outlet } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { Logo } from '@/components/brand/Logo';

export function OnboardingLayout() {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/[0.06] px-6 backdrop-blur-xl bg-bg/60">
          <Link to="/" className="flex items-center gap-2 focus-ring rounded">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent border border-white/[0.06] shadow-glass">
              <Logo size={26} />
            </span>
            <span className="text-sm font-semibold">WarmPulse</span>
          </Link>
          <Link to="/login" className="text-sm text-text-dim hover:text-text">
            Sign out
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-10">
          <div className="w-full max-w-2xl">
            <Outlet />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
