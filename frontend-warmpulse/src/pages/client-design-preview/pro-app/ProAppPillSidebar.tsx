import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  CreditCard,
  FileText,
  Gauge,
  Hammer,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * ProAppPillSidebar — Pro client preview navigation.
 *
 * Mirrors the admin floating glass-pill sidebar exactly:
 *   - Fixed position on the left edge, vertically centered
 *   - Icon-only with tooltips on hover
 *   - Violet pill background on active route
 *   - Glass / backdrop-blur surface
 *
 * Reuses .admin-pill__* class names from admin-shell.css so the visual
 * treatment stays in lockstep with the admin panel. The only difference
 * is the nav config (10 Pro sections vs. ADMIN_NAV).
 *
 * The footer "Exit preview" button replaces admin's Log out — it links
 * back to the Pro design picker landing instead of clearing auth state.
 */

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const PRO_NAV: NavItem[] = [
  { to: 'dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
  { to: 'mailboxes',  label: 'Mailboxes',  Icon: Mail },
  { to: 'activity',   label: 'Activity',   Icon: Activity },
  { to: 'analytics',  label: 'Analytics',  Icon: Gauge },
  { to: 'reputation', label: 'Reputation', Icon: ShieldCheck },
  { to: 'tools',      label: 'Tools',      Icon: Hammer },
  { to: 'reports',    label: 'Reports',    Icon: FileText },
  { to: 'workspace',  label: 'Workspace',  Icon: Users },
  { to: 'billing',    label: 'Billing',    Icon: CreditCard },
  { to: 'settings',   label: 'Settings',   Icon: Settings },
];

export function ProAppPillSidebar() {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="admin-pill"
      aria-label="Pro app navigation"
    >
      {/* Brand mark — same gradient + folded-letter mark as admin pill */}
      <NavLink to="dashboard" className="admin-pill__brand" aria-label="Pro home">
        <svg viewBox="0 0 80 80" fill="none">
          <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#pro-pill-grad)" />
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
            <linearGradient id="pro-pill-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F26522" />
              <stop offset="1" stopColor="#FF8A4B" />
            </linearGradient>
          </defs>
        </svg>
      </NavLink>

      <div className="admin-pill__divider" aria-hidden />

      <nav className="admin-pill__nav">
        {PRO_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `admin-pill__item ${isActive ? 'admin-pill__item--active' : ''}`
            }
            aria-label={item.label}
          >
            <item.Icon size={15} strokeWidth={2.1} />
            <span className="admin-pill__tooltip" role="tooltip">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-pill__divider" aria-hidden />

      <div className="admin-pill__footer">
        <span className="admin-pill__avatar" aria-hidden>
          AC
          <span className="admin-pill__tooltip admin-pill__tooltip--right" role="tooltip">
            alex@acme.com · Pro
          </span>
        </span>
        <Link
          to="/client-design-preview/pro"
          className="admin-pill__logout"
          aria-label="Exit preview"
        >
          <LogOut size={14} strokeWidth={2.1} />
          <span className="admin-pill__tooltip" role="tooltip">
            Exit preview
          </span>
        </Link>
      </div>
    </motion.aside>
  );
}
