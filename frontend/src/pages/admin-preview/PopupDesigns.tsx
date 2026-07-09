import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CreditCard,
  FileUp,
  Gauge,
  Mail,
  Sparkles,
  Trash2,
  UserCog,
} from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './popup-designs.css';

/**
 * /admin-design-preview/popups — design picker for admin popups.
 *
 * Shows four popup design SYSTEMS demonstrated across the five popup TYPES
 * that exist in the admin area. The user picks ONE system; we then refactor
 * the shared <AppDialog> primitive (`components/ui/AppDialog.tsx`) so every
 * popup in the app inherits the chosen look.
 *
 * Popup design systems
 * --------------------
 *   A. Hero Banner   — gradient banner with icon + title up top, body below
 *   B. Split Rail    — left brand rail with icon/meta, right pane has form
 *   C. Stepper Sheet — sheet-style with handle + progress stepper row
 *   D. Glass Float   — heavy frosted glass, raised, accent halo + corners
 *
 * Popup types we demonstrate
 * --------------------------
 *   1. Form          (Add Peer Inbox)         — multi-field create
 *   2. Quick edit    (Edit LLM cap)           — single-input inline edit
 *   3. Confirm       (Impersonate user)       — yes/no with rationale
 *   4. Destructive   (Delete plan + typed OK) — danger confirm
 *   5. Bulk import   (CSV upload + preview)   — file upload + preview rows
 */

type SystemCode = 'A' | 'B' | 'C' | 'D';
type PopupType = 'form' | 'edit' | 'confirm' | 'destructive' | 'bulk';

const SYSTEMS: Array<{
  code: SystemCode;
  name: string;
  tagline: string;
}> = [
  {
    code: 'A',
    name: 'Hero Banner',
    tagline:
      'Coloured gradient banner with icon + title. Reads loud and immediate — great for create/onboard flows.',
  },
  {
    code: 'B',
    name: 'Split Rail',
    tagline:
      'Left brand rail with icon, tagline and meta breadcrumbs; right pane is the focused form area.',
  },
  {
    code: 'C',
    name: 'Stepper Sheet',
    tagline:
      'Bottom-sheet aesthetic with a grab handle and a clear 1•2•3 stepper row — ideal for multi-step flows.',
  },
  {
    code: 'D',
    name: 'Glass Float',
    tagline:
      'Heavy frosted glass, raised on an accent halo, with corner glow decorations. Premium and weightless.',
  },
];

const TYPES: Array<{
  id: PopupType;
  num: string;
  name: string;
  tagline: string;
  realWorld: string;
}> = [
  {
    id: 'form',
    num: '01',
    name: 'Form / Create',
    tagline: 'Multi-field create dialogs — anything that builds a new resource.',
    realWorld: 'Add peer inbox · Edit plan · Create pool · Schedule report',
  },
  {
    id: 'edit',
    num: '02',
    name: 'Quick edit',
    tagline: 'Single-input inline edit — bumping a cap or renaming a field.',
    realWorld: 'Edit LLM cap · Rename pool · Update workspace label',
  },
  {
    id: 'confirm',
    num: '03',
    name: 'Confirm action',
    tagline: 'Yes/no with optional rationale field — non-destructive but consequential.',
    realWorld: 'Impersonate user · Suspend mailbox · Apply pool override',
  },
  {
    id: 'destructive',
    num: '04',
    name: 'Destructive',
    tagline: 'High-impact delete/disable — requires typed confirmation.',
    realWorld: 'Delete plan · Wipe workspace · Disable peer inbox',
  },
  {
    id: 'bulk',
    num: '05',
    name: 'Bulk import',
    tagline: 'File upload with row-level preview before commit.',
    realWorld: 'Bulk import peer inboxes · CSV user invite',
  },
];

export function PopupDesigns() {
  const [picked, setPicked] = useState<SystemCode | null>(null);

  return (
    <div className="pd">
      <div className="pd__atmosphere" aria-hidden>
        <div className="pd__aurora-1" />
        <div className="pd__aurora-2" />
      </div>

      <header className="pd__topbar">
        <Link to="/admin/dashboard" className="pd__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to admin
        </Link>
        <span className="pd__brand">WarmPulse · Popup design preview</span>
      </header>

      <main className="pd__main">
        <section className="pd__hero">
          <span className="pd__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Pick a popup design
          </span>
          <h1 className="pd__title">
            One look for every <em>popup</em> in admin.
          </h1>
          <p className="pd__sub">
            Four design systems demonstrated across the five popup types that
            exist in the admin area. Pick one system below and I'll refactor
            the shared <code>AppDialog</code> primitive so every popup in the
            app — add inbox, edit plan, impersonate, delete, bulk import,
            and the rest — inherits the chosen look automatically.
          </p>
        </section>

        {/* ---------- Design system swatches ---------- */}
        <section className="pd__systems">
          {SYSTEMS.map((s) => (
            <div className="pd__sys" key={s.code}>
              <div className={`pd__sys-swatch pd__sys-swatch--${s.code}`} />
              <div className="pd__sys-head">
                <span className="pd__sys-code">{s.code}</span>
                <span className="pd__sys-name">{s.name}</span>
              </div>
              <p className="pd__sys-tag">{s.tagline}</p>
            </div>
          ))}
        </section>

        {/* ---------- Per-type rows (form, edit, confirm, destructive, bulk) ---------- */}
        {TYPES.map((t) => (
          <section className="pd__section" key={t.id}>
            <header className="pd__section-head">
              <h2 className="pd__section-title">
                <span className="pd__section-num">{t.num}</span>
                {t.name}
              </h2>
              <p className="pd__section-sub">
                <strong style={{ color: 'var(--wp-text)' }}>{t.tagline}</strong>{' '}
                <span style={{ display: 'block', marginTop: 4 }}>{t.realWorld}</span>
              </p>
            </header>

            <div className="pd__row">
              {SYSTEMS.map((s) => (
                <PopupMockup key={`${t.id}-${s.code}`} system={s.code} type={t.id} />
              ))}
            </div>
          </section>
        ))}

        {/* ---------- Pick row ---------- */}
        <section className="pd__verdict">
          <div className="pd__verdict-text">
            <div>
              You picked: <strong>{picked ? `Design ${picked}` : 'Nothing yet'}</strong>
            </div>
            <p>
              Tell me your pick (e.g. <strong>"use A"</strong> or
              <strong> "B + a tweak"</strong>) and I'll wire it into
              <code> components/ui/AppDialog.tsx</code> so every existing
              popup inherits the new shell.
            </p>
          </div>
          <div className="pd__pick">
            {SYSTEMS.map((s) => (
              <button
                key={s.code}
                type="button"
                className={`pd__pick-btn ${picked === s.code ? 'pd__pick-btn--active' : ''}`}
                onClick={() => setPicked(s.code)}
              >
                Pick {s.code}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================================
   Popup mockup — dispatches to the type's content with the chosen system's
   chrome. Returns a tile that visually approximates a real popup.
============================================================================ */

function PopupMockup({ system, type }: { system: SystemCode; type: PopupType }) {
  const Icon = ICONS[type];
  const meta = META[type];
  const isDestructive = type === 'destructive';

  // Shared close + code tag rendered for every variant
  const Chrome = (
    <>
      <span className="pop__code">{system}</span>
      <span className="pop__close" aria-hidden />
    </>
  );

  if (system === 'A') {
    return (
      <div className={`pop pop--A ${isDestructive ? 'pop--destructive' : ''}`}>
        {Chrome}
        <div className="pop__banner">
          <div className="pop__banner-icon">
            <Icon size={16} strokeWidth={2.2} color="white" />
          </div>
          <span className="pop__title">{meta.title}</span>
          <span className="pop__desc">{meta.description}</span>
        </div>
        <div className="pop__body">
          <PopupBody type={type} />
        </div>
        <PopupFooter type={type} />
      </div>
    );
  }

  if (system === 'B') {
    return (
      <div className={`pop pop--B ${isDestructive ? 'pop--destructive' : ''}`}>
        {Chrome}
        <div className="pop__rail">
          <div className="pop__rail-icon">
            <Icon size={18} strokeWidth={2.2} />
          </div>
          <div className="pop__rail-title">{meta.title}</div>
          <div className="pop__rail-sub">{meta.description}</div>
          <div className="pop__rail-meta">
            <span>{meta.railMeta[0]}</span>
            <span>{meta.railMeta[1]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="pop__body">
            <PopupBody type={type} />
          </div>
          <PopupFooter type={type} />
        </div>
      </div>
    );
  }

  if (system === 'C') {
    return (
      <div className={`pop pop--C ${isDestructive ? 'pop--destructive' : ''}`}>
        {Chrome}
        <div className="pop__stepper">
          <div className="pop__step pop__step--done">
            <span className="pop__step-dot">✓</span>
            <span>Pick</span>
          </div>
          <span className="pop__step-tail" />
          <div className="pop__step pop__step--active">
            <span className="pop__step-dot">2</span>
            <span>Details</span>
          </div>
          <span className="pop__step-tail" />
          <div className="pop__step">
            <span className="pop__step-dot">3</span>
            <span>Confirm</span>
          </div>
        </div>
        <div className="pop__header">
          <div className="pop__title">{meta.title}</div>
          <div className="pop__desc">{meta.description}</div>
        </div>
        <div className="pop__body">
          <PopupBody type={type} />
        </div>
        <PopupFooter type={type} />
      </div>
    );
  }

  // system === 'D'
  return (
    <div className={`pop pop--D ${isDestructive ? 'pop--destructive' : ''}`}>
      {Chrome}
      <div>
        <div className="pop__title">{meta.title}</div>
        <div className="pop__desc">{meta.description}</div>
      </div>
      <div className="pop__body">
        <PopupBody type={type} />
      </div>
      <PopupFooter type={type} />
    </div>
  );
}

/* ============================================================================
   Per-type body renderers — content shared across the 4 variants.
============================================================================ */

function PopupBody({ type }: { type: PopupType }) {
  if (type === 'form') {
    return (
      <>
        <div className="pop__grid">
          <div className="pop__field">
            <span className="pop__label">Email</span>
            <span className="pop__input pop__input--filled">peer@acme.com</span>
          </div>
          <div className="pop__field">
            <span className="pop__label">Provider</span>
            <span className="pop__input pop__input--filled">Gmail / WS</span>
          </div>
        </div>
        <div className="pop__grid">
          <div className="pop__field">
            <span className="pop__label">SMTP host</span>
            <span className="pop__input">smtp.gmail.com</span>
          </div>
          <div className="pop__field">
            <span className="pop__label">Daily cap</span>
            <span className="pop__input pop__input--filled">40</span>
          </div>
        </div>
      </>
    );
  }

  if (type === 'edit') {
    return (
      <>
        <div className="pop__field">
          <span className="pop__label">Monthly token cap</span>
          <span className="pop__input pop__input--filled">2,500,000</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--wp-text-faint)' }}>
          Currently 1.9M used · resets on 1st
        </span>
      </>
    );
  }

  if (type === 'confirm') {
    return (
      <div className="pop__impact">
        <span className="pop__impact-icon">
          <ArrowRightLeft size={18} strokeWidth={2.2} />
        </span>
        <span className="pop__impact-target">jane@acme.com</span>
        <span style={{ fontSize: 10.5, color: 'var(--wp-text-dim)', maxWidth: 220 }}>
          You'll log in as this user. All actions are logged to the audit
          stream with your admin id.
        </span>
        <div className="pop__field" style={{ width: '100%', marginTop: 4 }}>
          <span className="pop__label">Reason (audit)</span>
          <span className="pop__input">Investigating SMTP bounce…</span>
        </div>
      </div>
    );
  }

  if (type === 'destructive') {
    return (
      <div className="pop__impact">
        <span className="pop__impact-icon">
          <AlertTriangle size={18} strokeWidth={2.2} />
        </span>
        <span className="pop__impact-target">Plan: Growth</span>
        <span style={{ fontSize: 10.5, color: 'var(--wp-text-dim)' }}>
          4 active subscribers will be downgraded to Free at next renewal.
        </span>
        <div className="pop__type-confirm" style={{ width: '100%', textAlign: 'left' }}>
          Type <code>DELETE</code> to confirm
          <div className="pop__input" style={{ marginTop: 4 }}>DELETE_</div>
        </div>
      </div>
    );
  }

  // bulk
  return (
    <>
      <div className="pop__field">
        <span className="pop__label">CSV file</span>
        <span className="pop__input pop__input--filled">peers_jan.csv · 12 rows</span>
      </div>
      <div className="pop__csv">
        <div className="pop__csv-row pop__csv-row--head">
          <span>Email</span>
          <span>Provider</span>
          <span>Status</span>
        </div>
        <div className="pop__csv-row">
          <span>p1@acme.com</span>
          <span>Gmail</span>
          <span className="pop__csv-pill">Ready</span>
        </div>
        <div className="pop__csv-row">
          <span>p2@acme.com</span>
          <span>Outlook</span>
          <span className="pop__csv-pill">Ready</span>
        </div>
        <div className="pop__csv-row">
          <span>p3@acme.com</span>
          <span>Yahoo</span>
          <span className="pop__csv-pill">Ready</span>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   Per-type footers — different CTAs / button labels.
============================================================================ */

function PopupFooter({ type }: { type: PopupType }) {
  if (type === 'destructive') {
    return (
      <div className="pop__footer">
        <span className="pop__btn pop__btn--ghost">Cancel</span>
        <span className="pop__btn pop__btn--danger">Delete plan</span>
      </div>
    );
  }
  if (type === 'confirm') {
    return (
      <div className="pop__footer">
        <span className="pop__btn pop__btn--ghost">Cancel</span>
        <span className="pop__btn pop__btn--primary">Impersonate</span>
      </div>
    );
  }
  if (type === 'edit') {
    return (
      <div className="pop__footer">
        <span className="pop__btn pop__btn--ghost">Cancel</span>
        <span className="pop__btn pop__btn--primary">Save</span>
      </div>
    );
  }
  if (type === 'bulk') {
    return (
      <div className="pop__footer">
        <span className="pop__btn pop__btn--ghost">Cancel</span>
        <span className="pop__btn pop__btn--primary">Import 12 peers</span>
      </div>
    );
  }
  // form
  return (
    <div className="pop__footer">
      <span className="pop__btn pop__btn--ghost">Cancel</span>
      <span className="pop__btn pop__btn--primary">Create inbox</span>
    </div>
  );
}

/* ============================================================================
   Per-type metadata (icon, title, description, rail meta breadcrumbs).
============================================================================ */

const ICONS = {
  form: Mail,
  edit: Gauge,
  confirm: UserCog,
  destructive: Trash2,
  bulk: FileUp,
} as const;

const META: Record<PopupType, {
  title: string;
  description: string;
  railMeta: [string, string];
}> = {
  form: {
    title: 'Add peer inbox',
    description: 'Connect a Gmail / Outlook / Yahoo peer to the warmup network.',
    railMeta: ['Admin · Peers', 'New record'],
  },
  edit: {
    title: 'Edit LLM cap',
    description: 'Bump the monthly token ceiling for this plan tier.',
    railMeta: ['Admin · LLM Usage', 'Plan: Growth'],
  },
  confirm: {
    title: 'Impersonate user',
    description: 'Sign in as another user. All actions are audited.',
    railMeta: ['Admin · Users', 'Audit logged'],
  },
  destructive: {
    title: 'Delete plan',
    description: 'High-impact action. Existing subscribers move to Free.',
    railMeta: ['Admin · Plans', 'Destructive'],
  },
  bulk: {
    title: 'Bulk import peers',
    description: 'Upload a CSV of peer mailboxes. We preview before commit.',
    railMeta: ['Admin · Peers', '12 rows ready'],
  },
};

// Silence unused-import linter for icons referenced via the ICONS map.
void [CreditCard];
