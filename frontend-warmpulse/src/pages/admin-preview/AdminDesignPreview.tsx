import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Box,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  Gauge,
  Globe,
  Home,
  Inbox,
  LayoutGrid,
  LogOut,
  Mail,
  Package,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './admin-design-preview.css';

/**
 * Admin design preview — a one-page picker that shows six admin dashboard
 * layouts and five sidebar variants side-by-side as mini mockups. The user
 * clicks one of each, then we build the chosen combo into the real
 * /admin route.
 *
 * Each mockup is rendered with CSS placeholders (no real data wiring) —
 * just enough structure so the user can read the visual language and pick
 * what fits. Hover over a tile to see its name + tagline.
 */
export function AdminDesignPreview() {
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [selectedSidebar, setSelectedSidebar] = useState<string | null>(null);

  return (
    <div className="adp-shell">
      <div className="adp-shell__atmosphere" aria-hidden>
        <div className="adp-shell__aurora-1" />
        <div className="adp-shell__aurora-2" />
      </div>

      <header className="adp-topbar">
        <Link to="/" className="adp-topbar__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back home
        </Link>
        <span className="adp-topbar__brand">WarmPulse · Admin design preview</span>
      </header>

      <main className="adp-main">
        <section className="adp-hero">
          <span className="adp-hero__eyebrow">
            <Sparkles size={11} strokeWidth={2.2} />
            Design exploration
          </span>
          <h1 className="adp-hero__title">
            Pick your <span className="wp-headline-grad">admin dashboard</span>
          </h1>
          <p className="adp-hero__sub">
            Six layout directions and five sidebar variants. Each is a mini
            mockup — click to mark your pick. Combinations are valid (e.g.
            <em> Command center + Icon rail</em>).
          </p>
        </section>

        {/* ---------- Layout designs ---------- */}
        <section className="adp-section">
          <header className="adp-section__head">
            <h2 className="adp-section__title">
              <span className="adp-section__step">1</span>
              Dashboard layout
            </h2>
            <p className="adp-section__sub">
              How the main /admin page is structured.
            </p>
          </header>

          <div className="adp-grid adp-grid--layouts">
            {LAYOUTS.map((l) => (
              <DesignTile
                key={l.id}
                selected={selectedLayout === l.id}
                onClick={() => setSelectedLayout(l.id)}
                code={l.code}
                name={l.name}
                tagline={l.tagline}
                bullets={l.bullets}
              >
                <l.Preview />
              </DesignTile>
            ))}
          </div>
        </section>

        {/* ---------- Sidebar variants ---------- */}
        <section className="adp-section">
          <header className="adp-section__head">
            <h2 className="adp-section__title">
              <span className="adp-section__step">2</span>
              Sidebar / navigation
            </h2>
            <p className="adp-section__sub">
              How the user navigates between admin sections.
            </p>
          </header>

          <div className="adp-grid adp-grid--sidebars">
            {SIDEBARS.map((s) => (
              <DesignTile
                key={s.id}
                selected={selectedSidebar === s.id}
                onClick={() => setSelectedSidebar(s.id)}
                code={s.code}
                name={s.name}
                tagline={s.tagline}
                bullets={s.bullets}
              >
                <s.Preview />
              </DesignTile>
            ))}
          </div>
        </section>

        {/* ---------- Selection summary ---------- */}
        <section className="adp-summary">
          <header className="adp-summary__head">
            <span className="adp-section__step">3</span>
            <h2 className="adp-section__title">Your pick</h2>
          </header>
          <div className="adp-summary__row">
            <div className="adp-summary__cell">
              <span className="adp-summary__label">Layout</span>
              <span className="adp-summary__value">
                {selectedLayout
                  ? LAYOUTS.find((l) => l.id === selectedLayout)?.name
                  : 'Not picked yet'}
              </span>
            </div>
            <div className="adp-summary__cell">
              <span className="adp-summary__label">Sidebar</span>
              <span className="adp-summary__value">
                {selectedSidebar
                  ? SIDEBARS.find((s) => s.id === selectedSidebar)?.name
                  : 'Not picked yet'}
              </span>
            </div>
            <div className="adp-summary__cell adp-summary__cell--cta">
              <p className="adp-summary__note">
                Tell me your picks (e.g. <strong>D2 + S2</strong>) and I'll wire
                the chosen combo into the real <code>/admin</code> route with
                live data.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================================
   Reusable tile
============================================================================ */

function DesignTile({
  selected,
  onClick,
  code,
  name,
  tagline,
  bullets,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  code: string;
  name: string;
  tagline: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={`adp-tile ${selected ? 'adp-tile--selected' : ''}`}
    >
      <div className="adp-tile__preview">{children}</div>
      <div className="adp-tile__body">
        <div className="adp-tile__head">
          <span className="adp-tile__code">{code}</span>
          <span className="adp-tile__name">{name}</span>
        </div>
        <p className="adp-tile__tagline">{tagline}</p>
        <ul className="adp-tile__bullets">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
      {selected && (
        <span className="adp-tile__check">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </motion.button>
  );
}

/* ============================================================================
   Layout previews — six directions
============================================================================ */

/** D1 — Classic sidebar dashboard. Industry-standard SaaS admin layout. */
function PreviewClassic() {
  return (
    <div className="mk mk--classic">
      <div className="mk__sidebar">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={`mk__nav-item ${i === 0 ? 'mk__nav-item--active' : ''}`} />
        ))}
      </div>
      <div className="mk__main">
        <div className="mk__topbar" />
        <div className="mk__stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mk__stat" />
          ))}
        </div>
        <div className="mk__grid2">
          <div className="mk__card mk__card--tall" />
          <div className="mk__card mk__card--tall" />
        </div>
      </div>
    </div>
  );
}

/** D2 — Command center. Ops-focused: traffic-light status strip + dense
 *  metric grid + live log stream. Built for the "is everything OK?" glance. */
function PreviewCommandCenter() {
  return (
    <div className="mk mk--command">
      <div className="mk__statuses">
        <span className="mk__dot mk__dot--ok" />
        <span className="mk__dot mk__dot--ok" />
        <span className="mk__dot mk__dot--warn" />
        <span className="mk__dot mk__dot--ok" />
        <span className="mk__dot mk__dot--err" />
      </div>
      <div className="mk__body">
        <div className="mk__metrics">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mk__metric" />
          ))}
        </div>
        <div className="mk__log">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="mk__log-line" />
          ))}
        </div>
      </div>
      <div className="mk__toolbar">
        <span /><span /><span /><span />
      </div>
    </div>
  );
}

/** D3 — Split inspector. Left list of resources, right detail panel. Best
 *  if you spend time drilling into individual users / peers / workspaces. */
function PreviewSplitInspector() {
  return (
    <div className="mk mk--inspector">
      <div className="mk__tabs">
        <span className="mk__tab mk__tab--active" />
        <span className="mk__tab" />
        <span className="mk__tab" />
      </div>
      <div className="mk__inspector-body">
        <div className="mk__list">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`mk__list-row ${i === 2 ? 'mk__list-row--active' : ''}`} />
          ))}
        </div>
        <div className="mk__detail">
          <div className="mk__detail-head" />
          <div className="mk__detail-meta">
            <span /><span /><span /><span />
          </div>
          <div className="mk__detail-chart" />
          <div className="mk__detail-actions">
            <span /><span />
          </div>
        </div>
      </div>
    </div>
  );
}

/** D4 — Health hub. Big hero health score + system cards in a row +
 *  trends + alerts feed. Reads like a status page. */
function PreviewHealthHub() {
  return (
    <div className="mk mk--hub">
      <div className="mk__hero">
        <div className="mk__hero-score" />
        <div className="mk__hero-rings">
          <span /><span /><span />
        </div>
      </div>
      <div className="mk__systems">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mk__system">
            <span className={`mk__dot ${i === 2 ? 'mk__dot--warn' : 'mk__dot--ok'}`} />
          </div>
        ))}
      </div>
      <div className="mk__trends" />
    </div>
  );
}

/** D5 — Tabbed workspace. Top tabs swap the whole content area. Minimal
 *  chrome, full focus on one concern at a time. */
function PreviewTabbed() {
  return (
    <div className="mk mk--tabbed">
      <div className="mk__tabbar">
        <span className="mk__tab mk__tab--active" />
        <span className="mk__tab" />
        <span className="mk__tab" />
        <span className="mk__tab" />
        <span className="mk__tab" />
      </div>
      <div className="mk__tab-body">
        <div className="mk__tab-hero" />
        <div className="mk__tab-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mk__tab-card" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** D6 — Bento grid. Asymmetric tiles of varying sizes, modular feel. */
function PreviewBento() {
  return (
    <div className="mk mk--bento">
      <div className="mk__bento mk__bento--lg" />
      <div className="mk__bento mk__bento--md" />
      <div className="mk__bento mk__bento--md" />
      <div className="mk__bento mk__bento--sm" />
      <div className="mk__bento mk__bento--sm" />
      <div className="mk__bento mk__bento--wide" />
    </div>
  );
}

/* ============================================================================
   Sidebar previews — five variants
============================================================================ */

/** S1 — Standard rail. 240px, icons + labels, persistent. */
function PreviewSidebarStandard() {
  const items = [
    { icon: Home, label: 'Overview' },
    { icon: Users, label: 'Users' },
    { icon: Inbox, label: 'Peer Inboxes' },
    { icon: BarChart3, label: 'Analytics' },
    { icon: Package, label: 'Plans' },
    { icon: Activity, label: 'System Health' },
    { icon: FileText, label: 'Audit' },
    { icon: Settings, label: 'Settings' },
  ];
  return (
    <div className="sk sk--standard">
      <div className="sk__brand">
        <span className="sk__logo" />
        <span className="sk__brand-text">WarmPulse</span>
      </div>
      <div className="sk__nav">
        {items.map((it, i) => (
          <div key={i} className={`sk__item ${i === 0 ? 'sk__item--active' : ''}`}>
            <it.icon size={12} strokeWidth={2.2} />
            <span>{it.label}</span>
          </div>
        ))}
      </div>
      <div className="sk__footer">
        <span className="sk__avatar" />
        <span className="sk__user">admin@…</span>
        <LogOut size={11} strokeWidth={2} />
      </div>
    </div>
  );
}

/** S2 — Icon-only rail. 60px, icons only, labels on hover. */
function PreviewSidebarIcon() {
  const icons = [Home, Users, Inbox, BarChart3, Package, Activity, FileText, Settings];
  return (
    <div className="sk sk--icon">
      <div className="sk__logo sk__logo--center" />
      <div className="sk__nav sk__nav--icon">
        {icons.map((Icon, i) => (
          <div key={i} className={`sk__item-icon ${i === 0 ? 'sk__item-icon--active' : ''}`}>
            <Icon size={13} strokeWidth={2.2} />
          </div>
        ))}
      </div>
      <div className="sk__avatar sk__avatar--solo" />
    </div>
  );
}

/** S3 — Top nav bar. No sidebar — items run horizontally across the top,
 *  more space for content below. */
function PreviewSidebarTopnav() {
  const items = ['Overview', 'Users', 'Peers', 'Analytics', 'Plans', 'Health', 'Audit'];
  return (
    <div className="sk sk--topnav">
      <div className="sk__topnav-bar">
        <span className="sk__logo sk__logo--inline" />
        <div className="sk__topnav-items">
          {items.map((it, i) => (
            <span key={i} className={`sk__topnav-item ${i === 0 ? 'sk__topnav-item--active' : ''}`}>
              {it}
            </span>
          ))}
        </div>
        <span className="sk__avatar sk__avatar--small" />
      </div>
      <div className="sk__topnav-content">
        <div className="sk__topnav-block" />
        <div className="sk__topnav-block" />
      </div>
    </div>
  );
}

/** S4 — Floating glass pill. Sidebar floats on the left as a pill, not
 *  attached to edges. Icons only, with a subtle glass blur. */
function PreviewSidebarPill() {
  const icons = [Home, Users, Inbox, BarChart3, Activity, FileText, Settings];
  return (
    <div className="sk sk--pill">
      <div className="sk__pill">
        {icons.map((Icon, i) => (
          <div key={i} className={`sk__pill-item ${i === 0 ? 'sk__pill-item--active' : ''}`}>
            <Icon size={12} strokeWidth={2.2} />
          </div>
        ))}
      </div>
      <div className="sk__pill-content">
        <span /><span /><span />
      </div>
    </div>
  );
}

/** S5 — Mega menu with categories. Sidebar split into sections
 *  (Operations / Users / Billing / System), each with sub-items. */
function PreviewSidebarMega() {
  const sections = [
    { title: 'Operations', items: [Activity, Inbox, Globe] },
    { title: 'Users', items: [Users, Mail] },
    { title: 'Billing', items: [Package, CreditCard] },
    { title: 'System', items: [Database, FileText, Settings] },
  ];
  return (
    <div className="sk sk--mega">
      <div className="sk__brand">
        <span className="sk__logo" />
        <span className="sk__brand-text">WarmPulse</span>
      </div>
      <div className="sk__mega-nav">
        {sections.map((sec, i) => (
          <div key={i} className="sk__mega-section">
            <span className="sk__mega-title">{sec.title}</span>
            {sec.items.map((Icon, j) => (
              <div key={j} className={`sk__item ${i === 0 && j === 0 ? 'sk__item--active' : ''}`}>
                <Icon size={11} strokeWidth={2.2} />
                <span className="sk__mega-dot" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   Data
============================================================================ */

const LAYOUTS: Array<{
  id: string;
  code: string;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}> = [
  {
    id: 'classic',
    code: 'D1',
    name: 'Classic SaaS',
    tagline: 'Industry-standard. Familiar to every admin who\'s ever opened Stripe or Linear.',
    bullets: ['Sidebar + top bar + stat cards', 'Activity feed on the right', 'Fast to scan'],
    Preview: PreviewClassic,
  },
  {
    id: 'command',
    code: 'D2',
    name: 'Command Center',
    tagline: 'Ops-first. Traffic-light status strip and a live log so you spot incidents instantly.',
    bullets: ['Traffic-light system status', 'Dense metric grid', 'Live log stream'],
    Preview: PreviewCommandCenter,
  },
  {
    id: 'inspector',
    code: 'D3',
    name: 'Split Inspector',
    tagline: 'Drill-down focused. Resource list on left, full detail panel on right.',
    bullets: ['List + detail like a file manager', 'Best for user / peer drill-down', 'Keyboard-friendly'],
    Preview: PreviewSplitInspector,
  },
  {
    id: 'hub',
    code: 'D4',
    name: 'Health Hub',
    tagline: 'Reads like a status page. Big health score, system cards, trend charts, alerts feed.',
    bullets: ['Hero health score', 'Per-system cards in a row', 'Trend chart strip'],
    Preview: PreviewHealthHub,
  },
  {
    id: 'tabbed',
    code: 'D5',
    name: 'Tabbed Workspace',
    tagline: 'Minimal chrome. Top tabs swap the whole content area for tight focus.',
    bullets: ['Top tab bar swaps content', 'No sidebar competing for attention', 'One concern at a time'],
    Preview: PreviewTabbed,
  },
  {
    id: 'bento',
    code: 'D6',
    name: 'Bento Grid',
    tagline: 'Modular tiles of varying sizes. Surface multiple signals at once without feeling cluttered.',
    bullets: ['Asymmetric tile grid', 'Each tile a focused signal', 'Modern, Apple-inspired'],
    Preview: PreviewBento,
  },
];

const SIDEBARS: Array<{
  id: string;
  code: string;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}> = [
  {
    id: 'standard',
    code: 'S1',
    name: 'Standard rail',
    tagline: '240px sidebar with icons + labels. Familiar, scannable, always visible.',
    bullets: ['Icons + text labels', 'Active state pill', 'Footer for admin profile'],
    Preview: PreviewSidebarStandard,
  },
  {
    id: 'icon',
    code: 'S2',
    name: 'Icon-only rail',
    tagline: '60px rail. Maximises content area, labels on hover. Very modern.',
    bullets: ['Just icons, ~60px wide', 'Tooltips on hover', 'Best for power users'],
    Preview: PreviewSidebarIcon,
  },
  {
    id: 'topnav',
    code: 'S3',
    name: 'Top nav (no sidebar)',
    tagline: 'Horizontal nav across the top. More width for content below.',
    bullets: ['No sidebar at all', 'Items run horizontally', 'Wider canvas for content'],
    Preview: PreviewSidebarTopnav,
  },
  {
    id: 'pill',
    code: 'S4',
    name: 'Floating glass pill',
    tagline: 'Sidebar floats centrally as a glass pill — modern, weightless.',
    bullets: ['Floats away from edges', 'Glass / blurred background', 'Distinctive, eye-catching'],
    Preview: PreviewSidebarPill,
  },
  {
    id: 'mega',
    code: 'S5',
    name: 'Categorised mega-menu',
    tagline: 'Sidebar split into Operations / Users / Billing / System sections.',
    bullets: ['Grouped by domain', 'Each section has sub-items', 'Scales as you add features'],
    Preview: PreviewSidebarMega,
  },
];

/* Lucide icon imports referenced in code above but not explicitly used as
   layout previews — kept for the JSX above to compile. */
void [
  AlertTriangle,
  Bell,
  Box,
  ChevronRight,
  Gauge,
  LayoutGrid,
  Search,
  Shield,
  Zap,
];
