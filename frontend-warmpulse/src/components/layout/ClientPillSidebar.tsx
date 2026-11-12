import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Smartphone } from 'lucide-react';
import { APP_APK_URL } from '@/lib/appDownload';
import { useAuthStore } from '@/stores/auth';
import { useBrand } from '@/components/BrandingProvider';
import { useDnsGate } from '@/lib/useDnsGate';
import { toast } from '@/components/ui/AppToast';
import { CLIENT_NAV } from './nav-config';
import { PillThemeToggle } from './PillThemeToggle';

/** Routes that remain reachable while the DNS gate is active. */
const DNS_GATE_ALLOWLIST = ['/app/settings', '/app/mailboxes'];

function isAllowedDuringGate(to: string): boolean {
  return DNS_GATE_ALLOWLIST.some((prefix) => to === prefix || to.startsWith(`${prefix}/`));
}

/**
 * Floating-glass-pill client sidebar — same aesthetic as
 * <AdminPillSidebar>. Vertical glass pill `position: fixed` on the left
 * edge of the viewport, vertically centered. Icons only; labels appear
 * as right-side tooltips on hover. Active route gets a violet pill
 * background.
 *
 * Sourced from CLIENT_NAV (Dashboard · Mailboxes · Warmup Activity ·
 * Analytics · Reputation · Tools · Reports · Workspace · Billing ·
 * Settings) — so the icon set differs from admin but the chrome is
 * identical via the shared .admin-pill* CSS in admin-shell.css.
 */
export function ClientPillSidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const brand = useBrand();
  const { gateActive } = useDnsGate();

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
      aria-label="Client navigation"
    >
      <NavLink
        to="/app/dashboard"
        className="admin-pill__brand"
        aria-label={`${brand.name} home`}
        title={brand.name}
      >
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-8 w-8 object-contain"
            style={{ maxWidth: 32, maxHeight: 32 }}
          />
        ) : (
          <svg viewBox="0 0 80 80" fill="none">
            <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#client-pill-grad)" />
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
              <linearGradient id="client-pill-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F26522" />
                <stop offset="1" stopColor="#FF8A4B" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <span className="admin-pill__tooltip" role="tooltip">
          {brand.name}
        </span>
      </NavLink>

      <div className="admin-pill__divider" aria-hidden />

      <nav className="admin-pill__nav">
        {CLIENT_NAV.map((item) => {
          const locked = gateActive && !isAllowedDuringGate(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={(e) => {
                if (locked) {
                  e.preventDefault();
                  toast.info('Fix your domain records (DNS) first to unlock this section.');
                }
              }}
              aria-disabled={locked || undefined}
              className={({ isActive }) =>
                `admin-pill__item ${isActive ? 'admin-pill__item--active' : ''} ${
                  locked ? 'opacity-40 cursor-not-allowed' : ''
                }`
              }
              aria-label={item.label}
            >
              <item.icon size={15} strokeWidth={2.1} />
              <span className="admin-pill__tooltip" role="tooltip">
                {item.label}
                {locked ? ' — locked' : ''}
              </span>
            </NavLink>
          );
        })}
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
        <span className="admin-pill__avatar" title={user?.email ?? 'User'}>
          <span className="admin-pill__avatar-badge" aria-hidden>
            {(user?.email ?? 'U').slice(0, 2).toUpperCase()}
          </span>
          <span className="admin-pill__tooltip" role="tooltip">
            {user?.email ?? 'User'}
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
