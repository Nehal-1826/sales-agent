import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles, Users } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-workspace-designs.css';

/**
 * /client-design-preview/workspace/starter — picker for STARTER Workspace.
 * Starter locks team invites, sub-clients, API keys — this section is
 * mostly workspace identity + plan + upsell.
 *
 *   W1 — Single Settings Card  Minimal, just-the-essentials, honest
 *   W2 — Locked Showcase       Identity + 4 cards (1 unlocked, 3 locked w/ upgrade)
 *   W3 — Workspace Profile     Identity-led profile aesthetic + activity feed
 *   W4 — Plan Upgrade Hub      Plan card + 3-column plan comparison strip
 */

type DesignCode = 'W1' | 'W2' | 'W3' | 'W4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientWorkspaceDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/workspace" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter workspace designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Users size={11} strokeWidth={2.4} />
            Section 8 · Workspace · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>workspace view</em>
          </h1>
          <p className="cdp__sub">
            Starter locks team invites, sub-clients, and API keys — so this section is
            mostly identity + plan + an upsell story. Four directions differ in how
            honestly minimal versus aggressively conversion-driven the layout feels.
          </p>
          <div className="cdp__plan-strip">
            <span className="cdp__plan-chip cdp__plan-chip--active">
              <span className="cdp__plan-chip-dot" style={{ background: '#f472b6' }} />
              Starter · Solo
            </span>
            <span className="cdp__plan-chip">
              <span
                className="cdp__plan-chip-dot"
                style={{ background: 'var(--wp-accent, #F26522)' }}
              />
              Pro · Team
            </span>
            <span className="cdp__plan-chip">
              <span className="cdp__plan-chip-dot" style={{ background: '#facc15' }} />
              Agency · Multi-tenant
            </span>
          </div>
        </section>

        <div className="cdp__grid">
          {VARIANTS.map((v) => (
            <button
              key={v.code}
              type="button"
              className={`cdp-tile ${picked === v.code ? 'cdp-tile--selected' : ''}`}
              onClick={() => setPicked(v.code)}
            >
              {picked === v.code && (
                <span className="cdp-tile__check">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              <div className="cdp-tile__preview">
                <v.Preview />
              </div>
              <div className="cdp-tile__body">
                <div className="cdp-tile__head">
                  <span className="cdp-tile__code">{v.code}</span>
                  <span className="cdp-tile__name">{v.name}</span>
                </div>
                <p className="cdp-tile__tag">{v.tagline}</p>
                <ul className="cdp-tile__bullets">
                  {v.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>

        <section className="cdp__verdict">
          <div className="cdp__verdict-text">
            <div>
              You picked:{' '}
              <strong>
                {picked
                  ? `${picked} — ${VARIANTS.find((v) => v.code === picked)?.name}`
                  : 'Nothing yet'}
              </strong>
            </div>
            <p>
              Tell me your pick (e.g. <strong>"use W2"</strong>) and we move to Section 9:
              Billing.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'W1',
    name: 'Single Settings Card',
    tagline:
      "Minimal. One card with name · slug · description · owner · plan · member count + Edit and Upgrade buttons. Honest, doesn't pad with locked-feature noise.",
    bullets: [
      'Single card with workspace identity',
      'Field rows (Name · Slug · Owner · Plan · Members)',
      'Edit + Upgrade buttons at the bottom',
      'Cleanest, least upsell-y',
    ],
    Preview: PreviewMinimal,
  },
  {
    code: 'W2',
    name: 'Locked Showcase',
    tagline:
      "Identity strip on top. Below: 4 feature cards — Workspace settings (unlocked, green tint), Team / Sub-clients / API keys (locked with Pro/Agency badges + Upgrade CTAs). Shows exactly what's missing.",
    bullets: [
      'Top: workspace identity card',
      '4-card grid: 1 unlocked + 3 locked',
      'Locked cards: Pro/Agency badge + Upgrade button',
      'Drives upgrade by showing what is gated',
    ],
    Preview: PreviewShowcase,
  },
  {
    code: 'W3',
    name: 'Workspace Profile',
    tagline:
      'Identity-led profile aesthetic. Big hero with workspace avatar + name + plan badge + member count. Below: 3-cell stat row + recent activity feed. Workspace as a place, not a settings page.',
    bullets: [
      'Hero card with avatar + name + plan badge',
      'Stat row: mailboxes · sends-30d · joined date',
      'Recent activity feed at the bottom',
      'Feels like a "place", not a form',
    ],
    Preview: PreviewProfile,
  },
  {
    code: 'W4',
    name: 'Plan Upgrade Hub',
    tagline:
      'Current plan card prominent on top with "Upgrade" CTA. Below: 3-column plan comparison strip (Starter · Pro · Agency) with feature tick/cross rows + per-plan CTA. Most conversion-focused.',
    bullets: [
      'Current-plan hero with Upgrade button',
      '3-column plan comparison strip',
      'Tick/cross rows per feature',
      'Pro column highlighted as "featured"',
    ],
    Preview: PreviewPlanHub,
  },
];

/* ---------- W1 Single Settings Card ---------- */
function PreviewMinimal() {
  return (
    <div className="mk mk--minimal">
      <div className="mk-min__card">
        <div className="mk-min__head">
          <span className="mk-ws-avatar mk-ws-avatar--lg" />
          <div className="mk-min__head-text">
            <span className="mk-pill mk-pill--accent" style={{ width: '55%', height: 9 }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
          <span className="mk-starter-pill">STARTER</span>
        </div>
        <div className="mk-min__rows">
          <div className="mk-min__row">
            <span className="mk-min__label">Name</span>
            <span className="mk-pill" style={{ width: '80%' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)' }} />
          </div>
          <div className="mk-min__row">
            <span className="mk-min__label">Slug</span>
            <span className="mk-pill" style={{ width: '65%' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)' }} />
          </div>
          <div className="mk-min__row">
            <span className="mk-min__label">Owner</span>
            <span className="mk-pill" style={{ width: '70%' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)' }} />
          </div>
          <div className="mk-min__row">
            <span className="mk-min__label">Members</span>
            <span className="mk-pill mk-pill--accent" style={{ width: '12%' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)' }} />
          </div>
        </div>
        <div className="mk-min__buttons">
          <span className="mk-min__btn" />
          <span className="mk-min__btn mk-min__btn--primary" />
        </div>
      </div>
    </div>
  );
}

/* ---------- W2 Locked Showcase ---------- */
function PreviewShowcase() {
  return (
    <div className="mk mk--showcase">
      <div className="mk-sh__identity">
        <span className="mk-ws-avatar" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: '50%', height: 9 }} />
          <span className="mk-pill" style={{ width: '35%' }} />
        </div>
        <span className="mk-starter-pill">STARTER</span>
      </div>
      <div className="mk-sh__grid">
        <div className="mk-sh__card mk-sh__card--unlocked">
          <div className="mk-sh__card-head">
            <span className="mk-sh__card-icon" />
            <span className="mk-pill mk-pill--success" style={{ width: '20%' }} />
          </div>
          <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '90%' }} />
          <span className="mk-sh__cta mk-sh__cta--manage" />
        </div>
        <div className="mk-sh__card mk-sh__card--locked">
          <div className="mk-sh__card-head">
            <span className="mk-sh__card-icon" />
            <span className="mk-pro-pill">PRO</span>
          </div>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '85%' }} />
          <span className="mk-sh__cta mk-sh__cta--upgrade" />
        </div>
        <div className="mk-sh__card mk-sh__card--locked">
          <div className="mk-sh__card-head">
            <span className="mk-sh__card-icon" />
            <span className="mk-agency-pill">AGENCY</span>
          </div>
          <span className="mk-pill" style={{ width: '75%' }} />
          <span className="mk-pill" style={{ width: '80%' }} />
          <span className="mk-sh__cta mk-sh__cta--upgrade" />
        </div>
        <div className="mk-sh__card mk-sh__card--locked">
          <div className="mk-sh__card-head">
            <span className="mk-sh__card-icon" />
            <span className="mk-agency-pill">AGENCY</span>
          </div>
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-pill" style={{ width: '90%' }} />
          <span className="mk-sh__cta mk-sh__cta--upgrade" />
        </div>
      </div>
    </div>
  );
}

/* ---------- W3 Workspace Profile ---------- */
function PreviewProfile() {
  return (
    <div className="mk mk--profile">
      <div className="mk-pr__hero">
        <span className="mk-ws-avatar mk-ws-avatar--xl" />
        <div className="mk-pr__hero-text">
          <span className="mk-pill mk-pill--accent" style={{ width: '60%', height: 9 }} />
          <span className="mk-pill" style={{ width: '40%' }} />
          <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
            <span className="mk-starter-pill">STARTER</span>
            <span className="mk-pill" style={{ width: '25%' }} />
          </div>
        </div>
      </div>
      <div className="mk-pr__stat-row">
        <div className="mk-pr__stat">
          <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <div className="mk-pr__stat">
          <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <div className="mk-pr__stat">
          <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
      </div>
      <div className="mk-pr__feed">
        {['12:14', '09:08', 'Yest.', '22 May'].map((t, i) => (
          <div key={i} className="mk-pr__feed-row">
            <span className="mk-pr__feed-dot" />
            <span
              className="mk-pill"
              style={{ width: `${55 + (i * 11) % 30}%` }}
            />
            <span style={{ flex: 1 }} />
            <span className="mk-pr__feed-time">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- W4 Plan Upgrade Hub ---------- */
function PreviewPlanHub() {
  return (
    <div className="mk mk--plan">
      <div className="mk-pl__current">
        <span className="mk-ws-avatar" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span className="mk-starter-pill">CURRENT · STARTER</span>
          </div>
          <span className="mk-pill mk-pill--accent" style={{ width: '50%', height: 9 }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <span className="mk-pl__upgrade-btn" />
      </div>
      <div className="mk-pl__compare">
        <div className="mk-pl__col mk-pl__col--current">
          <div className="mk-pl__col-head">
            <span className="mk-starter-pill">STARTER</span>
          </div>
          <span className="mk-pl__price">₹1,500</span>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '75%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '70%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__cross" /><span className="mk-pill" style={{ width: '60%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__cross" /><span className="mk-pill" style={{ width: '65%' }} /></div>
          <span className="mk-pl__col-cta" />
        </div>
        <div className="mk-pl__col mk-pl__col--featured">
          <div className="mk-pl__col-head">
            <span className="mk-pro-pill">PRO</span>
            <span className="mk-pill mk-pill--accent" style={{ width: '20%' }} />
          </div>
          <span className="mk-pl__price">₹3,900</span>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '75%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '70%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '60%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__cross" /><span className="mk-pill" style={{ width: '65%' }} /></div>
          <span className="mk-pl__col-cta" />
        </div>
        <div className="mk-pl__col">
          <div className="mk-pl__col-head">
            <span className="mk-agency-pill">AGENCY</span>
          </div>
          <span className="mk-pl__price">₹9,900</span>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '75%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '70%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '60%' }} /></div>
          <div className="mk-pl__feature"><span className="mk-pl__check" /><span className="mk-pill" style={{ width: '65%' }} /></div>
          <span className="mk-pl__col-cta" />
        </div>
      </div>
    </div>
  );
}
