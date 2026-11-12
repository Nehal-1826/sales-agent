import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useAdminUi } from '@/stores/adminUi';
import { ADMIN_NAV_GROUPS } from './nav-config';

/**
 * Aurora Glass admin rail (design S3). Full-height glass rail with grouped,
 * labeled nav; collapses to an icon rail (state persisted in useAdminUi).
 * Replaces the old icon-only AdminPillSidebar.
 */
export function AdminRail() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const collapsed = useAdminUi((s) => s.railCollapsed);
  const toggleRail = useAdminUi((s) => s.toggleRail);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (user?.email ?? 'A').slice(0, 2).toUpperCase();

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`ag-rail ${collapsed ? 'ag-rail--collapsed' : ''}`}
      aria-label="Admin navigation"
    >
      <div className="ag-rail__top">
        <NavLink to="/admin/dashboard" className="ag-rail__brand" aria-label="Admin home">
          <span className="ag-rail__brand-mark" aria-hidden />
          <span className="ag-rail__brand-name">WarmPulse</span>
        </NavLink>
        <button
          type="button"
          className="ag-rail__toggle"
          onClick={toggleRail}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <nav className="ag-rail__nav">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.group}>
            <div className="ag-rail__group">{collapsed ? '•' : group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `ag-rail__item ${isActive ? 'ag-rail__item--active' : ''}`
                }
              >
                <item.icon size={16} strokeWidth={2.1} />
                <span className="ag-rail__label">{item.label}</span>
                {item.label === 'CRM' && <span className="ag-rail__badge">NEW</span>}
                <span className="ag-rail__tip" role="tooltip">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="ag-rail__footer">
        <span className="ag-rail__avatar" aria-hidden>{initials}</span>
        <span className="ag-rail__identity" title={user?.email ?? 'Admin'}>
          Super Admin<br />{user?.email ?? ''}
        </span>
        <button type="button" className="ag-rail__logout" onClick={handleLogout} aria-label="Log out">
          <LogOut size={14} />
          <span className="ag-rail__logout-label">Logout</span>
        </button>
      </div>
    </motion.aside>
  );
}
