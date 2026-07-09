import { motion } from 'framer-motion';
import { Gauge, KeyRound, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { authMethod, getMailboxHealth, toneForScore } from './shared';

/**
 * H1 — Composite Hub.
 * Workspace composite score at top + per-mailbox health cards below.
 */
export function H1Composite() {
  const allHealth = DEMO_MAILBOXES.map(getMailboxHealth);
  const workspaceComposite = Math.round(
    allHealth.reduce((s, h) => s + h.composite, 0) / allHealth.length,
  );
  const workspaceTone = toneForScore(workspaceComposite);

  const allIssues = allHealth.flatMap((h) => {
    const out: string[] = [];
    const m = h.mailbox;
    if (!m.spfOk) out.push(`${m.email.split('@')[0]}: SPF missing`);
    if (!m.dkimOk) out.push(`${m.email.split('@')[0]}: DKIM missing`);
    if (!m.dmarcOk) out.push(`${m.email.split('@')[0]}: DMARC missing`);
    if (h.warmth < 50) out.push(`${m.email.split('@')[0]}: warmth low`);
    if (h.auth < 100) out.push(`${m.email.split('@')[0]}: SMTP auth (consider OAuth)`);
    return out;
  });

  return (
    <div className="h1">
      {/* Workspace hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`h1__hero h1__hero--${workspaceTone}`}
      >
        <CompositeGauge value={workspaceComposite} tone={workspaceTone} size={170} />
        <div className="h1__hero-text">
          <span className={`h1__hero-pill h1__hero-pill--${workspaceTone}`}>
            {workspaceTone === 'success' ? <ShieldCheck size={11} strokeWidth={2.4} /> :
             workspaceTone === 'warning' ? <TriangleAlert size={11} strokeWidth={2.4} /> :
             <ShieldAlert size={11} strokeWidth={2.4} />}
            {workspaceTone === 'success' ? 'Healthy' : workspaceTone === 'warning' ? 'Needs attention' : 'Critical'}
          </span>
          <h2 className="h1__hero-title">
            {workspaceTone === 'success'
              ? 'Workspace reputation is healthy'
              : workspaceTone === 'warning'
                ? 'A few mailboxes need attention'
                : 'Workspace reputation needs work'}
          </h2>
          <p className="h1__hero-detail">
            Composite score is averaged across <strong>{DEMO_MAILBOXES.length}</strong> mailboxes.
            {allIssues.length === 0
              ? ' All deliverability signals are healthy across the workspace.'
              : ` We found ${allIssues.length} ${allIssues.length === 1 ? 'issue' : 'issues'}: ${allIssues.slice(0, 3).join(' · ')}${allIssues.length > 3 ? ` · +${allIssues.length - 3} more` : ''}.`}
          </p>
          <div className="h1__hero-subs">
            <SubScore label="DNS" value={Math.round(allHealth.reduce((s, h) => s + h.dns, 0) / allHealth.length)} />
            <span className="h1__hero-sub-divider" />
            <SubScore label="Warmth" value={Math.round(allHealth.reduce((s, h) => s + h.warmth, 0) / allHealth.length)} />
            <span className="h1__hero-sub-divider" />
            <SubScore label="Auth" value={Math.round(allHealth.reduce((s, h) => s + h.auth, 0) / allHealth.length)} />
          </div>
        </div>
      </motion.section>

      {/* Per-mailbox cards */}
      <div className="h1__cards">
        {allHealth.map((h, i) => (
          <motion.section
            key={h.mailbox.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 + i * 0.05 }}
            className={`h1__card h1__card--${h.tone}`}
          >
            <header className="h1__card-head">
              <ProviderSwatch provider={h.mailbox.provider} size={28} />
              <div className="h1__card-id">
                <span className="h1__card-email">{h.mailbox.email.split('@')[0]}</span>
                <span className="h1__card-sub">{providerLabel(h.mailbox.provider)}</span>
              </div>
              <CompositeGauge value={h.composite} tone={h.tone} size={56} compact />
            </header>
            <div className="h1__card-subs">
              <SubScoreBar label="DNS" value={h.dns} Icon={ShieldCheck} />
              <SubScoreBar label="Warmth" value={h.warmth} Icon={Gauge} />
              <SubScoreBar label="Auth" value={h.auth} Icon={KeyRound} />
            </div>
            <footer className="h1__card-foot">
              <span className="h1__card-foot-meta">
                {authMethod(h.mailbox.provider)} · Day {h.mailbox.day}
              </span>
            </footer>
          </motion.section>
        ))}
      </div>
    </div>
  );
}

function CompositeGauge({ value, tone, size, compact }: { value: number; tone: 'success' | 'warning' | 'danger'; size: number; compact?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h1-gauge h1-gauge--${tone} ${compact ? 'h1-gauge--compact' : ''}`}
      style={{
        ['--pct' as string]: String(pct),
        width: size,
        height: size,
      } as React.CSSProperties}
      aria-label={`Composite score ${pct}`}
    >
      <div className="h1-gauge__inner" style={{ width: size * 0.76, height: size * 0.76 }}>
        <span className="h1-gauge__num" style={{ fontSize: size * 0.28 }}>{pct}</span>
        {!compact && <span className="h1-gauge__lbl">{tone === 'success' ? 'HEALTHY' : tone === 'warning' ? 'WATCH' : 'ACTION'}</span>}
      </div>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const tone = toneForScore(value);
  return (
    <span className="h1__hero-sub">
      <span className={`h1__hero-sub-dot h1__hero-sub-dot--${tone}`} />
      <span className="h1__hero-sub-lbl">{label}</span>
      <span className="h1__hero-sub-num">{value}</span>
    </span>
  );
}

function SubScoreBar({ label, value, Icon }: { label: string; value: number; Icon: typeof Sparkles }) {
  const tone = toneForScore(value);
  return (
    <div className="h1__sub">
      <span className={`h1__sub-icon h1__sub-icon--${tone}`}>
        <Icon size={11} strokeWidth={2.4} />
      </span>
      <div className="h1__sub-body">
        <span className="h1__sub-lbl">{label}</span>
        <span className="h1__sub-track">
          <span className={`h1__sub-fill h1__sub-fill--${tone}`} style={{ width: `${value}%` }} />
        </span>
      </div>
      <span className={`h1__sub-num h1__sub-num--${tone}`}>{value}</span>
    </div>
  );
}

