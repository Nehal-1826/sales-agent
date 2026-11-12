import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Smartphone } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { APP_APK_URL } from '@/lib/appDownload';
import { ADMIN_NAV } from './nav-config';
import { PillThemeToggle } from './PillThemeToggle';

/**
 * Floating-glass-pill admin sidebar (design S4).
 *
 * Sits as a vertical glass pill `position: fixed` on the left edge of the
 * viewport, vertically centered. Icons only — labels appear as right-side
 * tooltips on hover. Active route gets a violet pill background.
 *
 * Why a separate component instead of reusing `Sidebar.tsx`:
 * - `Sidebar.tsx` is a flexbox column with labels + chrome that would need
 *   significant overrides to look like a floating pill.
 * - The pill should NOT take layout space — the dashboard content extends
 *   to the full width and the pill floats on top. That's incompatible with
 *   the existing layout's `flex` row.
 */
export function AdminPillSidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="admin-pill"
      aria-label="Admin navigation"
    >
      {/* Brand mark at the top of the pill — same icon-only logo as the
          onboarding dashboard for continuity. */}
      <NavLink to="/admin/dashboard" className="admin-pill__brand" aria-label="Admin home">
        <svg viewBox="0 0 80 80" fill="none">
          <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#admin-pill-grad)" />
          <path
            d="M16 30 L40 48 L64 30"
            stroke="white"
            strokeWidth="3.5"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30"
            stroke="white"
            strokeWidth="3.5"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="admin-pill-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F26522" />
              <stop offset="1" stopColor="#FF8A4B" />
            </linearGradient>
          </defs>
        </svg>
      </NavLink>

      <div className="admin-pill__divider" aria-hidden />

      <nav className="admin-pill__nav">
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `admin-pill__item ${isActive ? 'admin-pill__item--active' : ''}`
            }
            aria-label={item.label}
          >
            <item.icon size={15} strokeWidth={2.1} />
            <span className="admin-pill__tooltip" role="tooltip">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-pill__divider" aria-hidden />

      <div className="admin-pill__footer">
        <a
          href={APP_APK_URL}
          download
          className="admin-pill__item"
          aria-label="Download Android app"
        >
          <Smartphone size={15} strokeWidth={2.1} />
          <span className="admin-pill__tooltip" role="tooltip">
            Download Android app
          </span>
        </a>
        <PillThemeToggle />
        <span className="admin-pill__avatar" title={user?.email ?? 'Admin'}>
          <span className="admin-pill__avatar-badge" aria-hidden>
            {(user?.email ?? 'A').slice(0, 2).toUpperCase()}
          </span>
          <span className="admin-pill__tooltip" role="tooltip">
            {user?.email ?? 'Admin'}
          </span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="admin-pill__logout"
          aria-label="Log out"
        >
          <LogOut size={14} strokeWidth={2.1} />
          <span className="admin-pill__tooltip" role="tooltip">
            Log out
          </span>
        </button>
      </div>
    </motion.aside>
  );
}
