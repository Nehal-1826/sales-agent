import { Link, Outlet, NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';

/**
 * Top-nav + outlet + footer, used for landing, login, signup.
 * Scroll progress bar is provided globally from main.tsx.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-6">
          <Link to="/" className="flex items-center gap-2 focus-ring rounded">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent border border-white/[0.06] shadow-glass">
              <Logo size={26} />
            </span>
            <span className="text-sm font-semibold tracking-tight">WarmPulse</span>
          </Link>

          <nav className="ml-10 hidden items-center gap-6 text-sm text-text-dim md:flex">
            <NavLink to="/#product" className="hover:text-text">Features</NavLink>
            <NavLink to="/#pricing" className="hover:text-text">Pricing</NavLink>
            <NavLink to="/how-it-works" className="hover:text-text">FAQ</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link to="/signup">Start free trial</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 text-sm text-text-dim md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-text">Privacy</Link>
            <Link to="/terms" className="hover:text-text">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
