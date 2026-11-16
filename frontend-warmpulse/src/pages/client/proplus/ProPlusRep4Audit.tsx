import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Fingerprint,
  Globe,
  Mail,
  MinusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import { formatDateTime } from '@/lib/format';

/**
 * ProPlusRep4Audit — "Deliverability Audit" (Pro Plus reputation differentiator).
 *
 * A structured pre-flight INSPECTION / COMPLIANCE-AUDIT REPORT for the sending
 * domain — the kind of document a deliverability consultant hands back: an
 * overall pass/warn/fail verdict, collapsible inspection *sections*, and one
 * *row per check* (status icon, observed value vs the expected threshold) with
 * an expandable "How to fix" remediation drawer that prints the exact DNS
 * record / action for every warn or fail.
 *
 * Deliberately NOT any sibling shape:
 *   • NOT a card dashboard / health matrix (ProPlusReputation, ProReputation,
 *     StarterReputation, the *Card primitives).
 *   • NOT a NOC ops / status board (ProPlusRep1Mission).
 *   • NOT an accounting ledger (ProPlusRep2Ledger).
 *   • NOT a node-link signal map (ProPlusRep3SignalMap).
 *   • NOT a graded letter-scorecard (used by Analytics).
 * It is an inspection checklist with remediation — a report, not a dashboard.
 *
 * Standalone for the isolated preview harness: NO network / router / query
 * hooks, NO required props, inline MOCK. Renders ONLY page content — the
 * harness supplies the shell + sidebar. Pro Plus framing: 15 mailboxes,
 * Postmaster + SNDS *live-fed* (the evidence panel shows the raw signals the
 * audit was run against — the unlock).
 *
 * Everything is computed: the overall verdict, the pass/warn/fail counts and
 * the weighted readiness % are all derived from the check list via a real
 * reduce. Section expand/collapse and per-row remediation drawers are real
 * useState. Animation (framer-motion): section bodies expand/collapse with
 * AnimatePresence height, check rows stagger in, status icons pop, the
 * remediation drawer slides, the readiness bar fills, and the summary counts
 * animate up.
 *
 * Colour: existing Tailwind tokens only. pass → accent, warn → accent4,
 * fail → accent3. No new colours, no chart library needed.
 */

// ---------------------------------------------------------------------------
// Status model
// ---------------------------------------------------------------------------

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

const STATUS_META: Record<
  CheckStatus,
  {
    text: string;
    dot: string;
    ring: string;
    label: string;
    Icon: typeof CheckCircle2;
    /** Audit weight contribution as a fraction of the check's full weight. */
    factor: number;
  }
> = {
  pass: {
    text: 'text-accent',
    dot: 'bg-accent',
    ring: 'border-accent/30 bg-accent/10',
    label: 'Pass',
    Icon: CheckCircle2,
    factor: 1,
  },
  warn: {
    text: 'text-accent4',
    dot: 'bg-accent4',
    ring: 'border-accent4/30 bg-accent4/10',
    label: 'Warning',
    Icon: ShieldAlert,
    factor: 0.5,
  },
  fail: {
    text: 'text-accent3',
    dot: 'bg-accent3',
    ring: 'border-accent3/30 bg-accent3/10',
    label: 'Fail',
    Icon: XCircle,
    factor: 0,
  },
  skip: {
    text: 'text-text-dim',
    dot: 'bg-border-muted',
    ring: 'border-border-muted bg-surface-2',
    label: 'Not run',
    Icon: MinusCircle,
    factor: 1,
  },
};

// ---------------------------------------------------------------------------
// Mock data — an inspection report: sections → checks → remediation
// ---------------------------------------------------------------------------

interface Remediation {
  /** Numbered "how to fix" steps. */
  steps: string[];
  /** The exact record / action to apply (monospace block). */
  record?: { kind: string; host: string; value: string };
}

interface AuditCheck {
  id: string;
  name: string;
  detail: string;
  status: CheckStatus;
  observed: string;
  expected: string;
  /** Relative weight in the readiness roll-up. */
  weight: number;
  remediation?: Remediation;
}

interface AuditSection {
  id: string;
  title: string;
  blurb: string;
  Icon: typeof Globe;
  /** Pro Plus live-fed source badge (Postmaster / SNDS). */
  liveFeed?: string;
  checks: AuditCheck[];
}

interface EvidenceMetric {
  label: string;
  value: string;
  status: CheckStatus;
}

interface EvidenceSource {
  id: string;
  name: string;
  sub: string;
  Icon: typeof Mail;
  syncedAgo: string;
  metrics: EvidenceMetric[];
}

interface AuditReport {
  domain: string;
  mailboxCount: number;
  ranAt: string;
  durationMs: number;
  sections: AuditSection[];
  evidence: EvidenceSource[];
}

const MOCK: AuditReport = {
  domain: 'acme.io',
  mailboxCount: 15,
  ranAt: '2026-05-18T13:52:00Z',
  durationMs: 4180,
  sections: [
    {
      id: 'auth',
      title: 'Authentication',
      blurb: 'SPF, DKIM, DMARC, BIMI and mail server records (MX) on the sending domain.',
      Icon: Fingerprint,
      checks: [
        {
          id: 'spf',
          name: 'SPF record',
          detail: 'Single published SPF record resolving within the lookup limit.',
          status: 'pass',
          observed: '1 record · 7 lookups',
          expected: '1 record · ≤ 10 lookups',
          weight: 3,
        },
        {
          id: 'dkim',
          name: 'DKIM signature',
          detail: 'Selector publishes a 2048-bit key; mail is signed and aligned.',
          status: 'pass',
          observed: '2048-bit · aligned',
          expected: '≥ 1024-bit · aligned',
          weight: 3,
        },
        {
          id: 'dmarc',
          name: 'DMARC policy',
          detail: 'Policy strength gates how spoofed mail is handled at the inbox.',
          status: 'warn',
          observed: 'p=quarantine; pct=100',
          expected: 'p=reject (enforcement)',
          weight: 3,
          remediation: {
            steps: [
              'Confirm 100% of legitimate sources align on SPF or DKIM (your aggregate reports already show full alignment for 30 days).',
              'Tighten the policy from quarantine to reject so spoofed mail is dropped, not foldered.',
              'Publish the updated TXT record below and allow up to 1 hour for domain records (DNS) propagation.',
            ],
            record: {
              kind: 'TXT',
              host: '_dmarc.acme.io',
              value:
                'v=DMARC1; p=reject; rua=mailto:dmarc@acme.io; ruf=mailto:dmarc@acme.io; fo=1; adkim=s; aspf=s',
            },
          },
        },
        {
          id: 'bimi',
          name: 'BIMI + VMC',
          detail: 'Brand logo at the inbox; requires DMARC at enforcement first.',
          status: 'fail',
          observed: 'No BIMI record',
          expected: 'Record + valid VMC',
          weight: 1,
          remediation: {
            steps: [
              'BIMI is blocked until the DMARC policy above is at p=reject — resolve that warning first.',
              'Host a square SVG Tiny-PS logo over HTTPS and obtain a Verified Mark Certificate from a BIMI authority.',
              'Publish the BIMI TXT record below referencing the SVG and the VMC PEM.',
            ],
            record: {
              kind: 'TXT',
              host: 'default._bimi.acme.io',
              value:
                'v=BIMI1; l=https://acme.io/bimi/logo.svg; a=https://acme.io/bimi/vmc.pem',
            },
          },
        },
        {
          id: 'mx',
          name: 'Mail server records (MX)',
          detail: 'Receiving hosts resolve and accept mail for the domain.',
          status: 'pass',
          observed: '2 MX · responding',
          expected: '≥ 1 MX · responding',
          weight: 2,
        },
      ],
    },
    {
      id: 'iprep',
      title: 'IP & Domain Trust',
      blurb: 'Google Postmaster Tools — domain trust, IP trust, spam rate and auth pass.',
      Icon: ShieldCheck,
      liveFeed: 'Google Postmaster · synced 9m ago',
      checks: [
        {
          id: 'domain-rep',
          name: 'Domain trust',
          detail: 'Gmail-reported sending-domain trust tier.',
          status: 'pass',
          observed: 'High',
          expected: 'High',
          weight: 4,
        },
        {
          id: 'ip-rep',
          name: 'IP trust',
          detail: 'Trust of the IPs your warmup mail is sent from.',
          status: 'pass',
          observed: 'High (3 IPs)',
          expected: 'High / Medium',
          weight: 3,
        },
        {
          id: 'pm-spam',
          name: 'Spam rate',
          detail: 'Share of mail Gmail users marked as spam (user-reported).',
          status: 'pass',
          observed: '0.03%',
          expected: '< 0.10%',
          weight: 4,
        },
        {
          id: 'pm-auth',
          name: 'Authenticated traffic',
          detail: 'Share of mail passing SPF, DKIM and DMARC at Gmail.',
          status: 'pass',
          observed: '99.6%',
          expected: '≥ 99.0%',
          weight: 2,
        },
        {
          id: 'pm-encryption',
          name: 'Inbound TLS',
          detail: 'Share of mail delivered over an encrypted connection.',
          status: 'warn',
          observed: '97.4%',
          expected: '≥ 99.0%',
          weight: 1,
          remediation: {
            steps: [
              'A small slice of mail is being delivered without TLS — usually one downstream relay or forwarder negotiating cleartext.',
              'Enforce opportunistic TLS on every connector that relays this domain and disable plaintext fallback.',
              'Consider adding an MTA-STS policy and a TLS-RPT address so future downgrade is reported automatically.',
            ],
            record: {
              kind: 'TXT',
              host: '_mta-sts.acme.io',
              value: 'v=STSv1; id=20260518T000000Z',
            },
          },
        },
      ],
    },
    {
      id: 'engagement',
      title: 'Opens & Replies Signals',
      blurb: 'Microsoft SNDS per-IP filter data plus warmup open and reply health.',
      Icon: Mail,
      liveFeed: 'Microsoft SNDS · synced 14m ago',
      checks: [
        {
          id: 'snds-ip',
          name: 'SNDS IP status',
          detail: 'Microsoft filter colour for every sending IP.',
          status: 'pass',
          observed: 'Green (3 IPs)',
          expected: 'Green',
          weight: 4,
        },
        {
          id: 'snds-complaint',
          name: 'Complaint rate',
          detail: 'Outlook / Hotmail junk-button complaints per delivered mail.',
          status: 'pass',
          observed: '0.003%',
          expected: '< 0.30%',
          weight: 4,
        },
        {
          id: 'snds-trap',
          name: 'Spam-trap hits',
          detail: 'Known recycled / pristine trap addresses hit in the last 30 days.',
          status: 'warn',
          observed: '1 trap (30d)',
          expected: '0 traps',
          weight: 3,
          remediation: {
            steps: [
              'One recycled-trap hit was recorded on a legacy list segment — the segment has been auto-quarantined by the engine.',
              'Do not re-enable the quarantined segment; let it age out rather than re-mailing it.',
              'Keep warmup helper recipients only — never import a cold list into a warming mailbox.',
            ],
          },
        },
        {
          id: 'open-health',
          name: 'Open-signal health',
          detail: 'Helper-network opens landing within the expected window.',
          status: 'pass',
          observed: '94% within 2h',
          expected: '≥ 85% within 2h',
          weight: 2,
        },
        {
          id: 'reply-health',
          name: 'Reply-signal health',
          detail: 'Helper replies threading correctly back to the warmup mailbox.',
          status: 'pass',
          observed: '88% reply rate',
          expected: '≥ 70% reply rate',
          weight: 2,
        },
      ],
    },
    {
      id: 'blacklist',
      title: 'Block lists',
      blurb: 'Real-time block list (RBL) and domain block list (DBL) zones for the sending IPs and domain.',
      Icon: Siren,
      checks: [
        {
          id: 'bl-zen',
          name: 'Spamhaus ZEN',
          detail: 'Combined SBL + XBL + PBL lookup for all sending IPs.',
          status: 'pass',
          observed: 'Not listed',
          expected: 'Not listed',
          weight: 4,
        },
        {
          id: 'bl-dbl',
          name: 'Spamhaus DBL',
          detail: 'Domain blocklist lookup for the sending domain.',
          status: 'pass',
          observed: 'Not listed',
          expected: 'Not listed',
          weight: 3,
        },
        {
          id: 'bl-barracuda',
          name: 'Barracuda BRBL',
          detail: 'Barracuda Reputation Block List for all sending IPs.',
          status: 'pass',
          observed: 'Not listed',
          expected: 'Not listed',
          weight: 2,
        },
        {
          id: 'bl-sorbs',
          name: 'SORBS DUHL',
          detail: 'Dynamic User & Host List lookup for the secondary IP.',
          status: 'warn',
          observed: 'Listed (dynamic flag)',
          expected: 'Not listed',
          weight: 2,
          remediation: {
            steps: [
              'The secondary IP 198.51.100.24 is flagged on the SORBS dynamic range — common for IPs whose rDNS does not look static.',
              'Set a static-style PTR (reverse DNS) on the IP with your hosting provider, e.g. mail.acme.io.',
              'Submit the delisting request below once the PTR resolves; SORBS typically clears within 6–12 hours.',
            ],
            record: {
              kind: 'PTR',
              host: '24.100.51.198.in-addr.arpa',
              value: 'mail.acme.io  (then request delist at sorbs.net/delisting)',
            },
          },
        },
        {
          id: 'bl-spamcop',
          name: 'SpamCop SCBL',
          detail: 'SpamCop Blocking List for all sending IPs.',
          status: 'pass',
          observed: 'Not listed',
          expected: 'Not listed',
          weight: 2,
        },
        {
          id: 'bl-uceprotect',
          name: 'UCEPROTECT L1',
          detail: 'Level-1 single-IP blocklist for all sending IPs.',
          status: 'skip',
          observed: 'Not evaluated',
          expected: '—',
          weight: 1,
        },
      ],
    },
  ],
  evidence: [
    {
      id: 'postmaster',
      name: 'Google Postmaster Tools',
      sub: 'acme.io · Gmail-reported · live feed',
      Icon: ShieldCheck,
      syncedAgo: '9m ago',
      metrics: [
        { label: 'Domain trust', value: 'High', status: 'pass' },
        { label: 'IP trust', value: 'High', status: 'pass' },
        { label: 'Spam rate', value: '0.03%', status: 'pass' },
        { label: 'Auth pass', value: '99.6%', status: 'pass' },
        { label: 'Inbound TLS', value: '97.4%', status: 'warn' },
        { label: 'Feedback loop', value: 'Active', status: 'pass' },
      ],
    },
    {
      id: 'snds',
      name: 'Microsoft SNDS',
      sub: 'Outlook / Hotmail · per-IP filter · live feed',
      Icon: Mail,
      syncedAgo: '14m ago',
      metrics: [
        { label: 'IP status', value: 'Green', status: 'pass' },
        { label: 'Complaint rate', value: '0.003%', status: 'pass' },
        { label: 'Trap hits (30d)', value: '1', status: 'warn' },
        { label: 'Filter result', value: 'Inbox', status: 'pass' },
        { label: 'Volume / day', value: '2,284', status: 'pass' },
        { label: 'RCPT commands', value: 'Normal', status: 'pass' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Derived audit roll-up — every number below comes from a real reduce.
// ---------------------------------------------------------------------------

interface RollUp {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  readiness: number;
  /** Overall verdict word + which tone bucket it falls in. */
  verdict: string;
  verdictStatus: CheckStatus;
}

function rollUp(sections: AuditSection[]): RollUp {
  const checks = sections.flatMap((s) => s.checks);

  const counts = checks.reduce(
    (acc, c) => {
      acc[c.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 } as Record<CheckStatus, number>,
  );

  // Weighted readiness: each check contributes status.factor × its weight.
  const { earned, possible } = checks.reduce(
    (acc, c) => {
      acc.possible += c.weight;
      acc.earned += c.weight * STATUS_META[c.status].factor;
      return acc;
    },
    { earned: 0, possible: 0 },
  );
  const readiness = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  const verdictStatus: CheckStatus =
    counts.fail > 0 ? 'fail' : counts.warn > 0 ? 'warn' : 'pass';
  const verdict =
    counts.fail > 0
      ? `Failed — ${counts.fail} blocking ${counts.fail === 1 ? 'issue' : 'issues'}`
      : counts.warn > 0
        ? `Passed with ${counts.warn} ${counts.warn === 1 ? 'warning' : 'warnings'}`
        : 'Passed — all checks clear';

  return {
    total: checks.length,
    ...counts,
    readiness,
    verdict,
    verdictStatus,
  };
}

function sectionRollUp(section: AuditSection): {
  pass: number;
  warn: number;
  fail: number;
  worst: CheckStatus;
} {
  const c = section.checks.reduce(
    (acc, ck) => {
      if (ck.status === 'pass' || ck.status === 'skip') acc.pass += 1;
      else acc[ck.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as Record<'pass' | 'warn' | 'fail', number>,
  );
  const worst: CheckStatus = c.fail > 0 ? 'fail' : c.warn > 0 ? 'warn' : 'pass';
  return { ...c, worst };
}

// ---------------------------------------------------------------------------
// Count-up hook — animates the summary tallies once the report scrolls in.
// ---------------------------------------------------------------------------

function useCountUp(target: number, run: boolean, ms = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) {
      setVal(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return val;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRanAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateTime(d);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRep4Audit(): JSX.Element {
  const report = MOCK;
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryIn = useInView(summaryRef, { once: true, amount: 0.35 });

  const roll = useMemo(() => rollUp(report.sections), [report.sections]);

  // Sections open by default; failing/warning ones must stay visible.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(report.sections.map((s) => [s.id, true])) as Record<
        string,
        boolean
      >,
  );
  // Which remediation drawers are expanded (by check id).
  const [openFixes, setOpenFixes] = useState<Record<string, boolean>>({});
  // Re-run audit affordance (cosmetic spinner; no network).
  const [rerunning, setRerunning] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleSection = (id: string) =>
    setOpenSections((p) => ({ ...p, [id]: !p[id] }));
  const toggleFix = (id: string) =>
    setOpenFixes((p) => ({ ...p, [id]: !p[id] }));

  const allOpen = report.sections.every((s) => openSections[s.id]);
  const setAll = (open: boolean) =>
    setOpenSections(
      Object.fromEntries(report.sections.map((s) => [s.id, open])) as Record<
        string,
        boolean
      >,
    );

  const handleRerun = () => {
    if (rerunning) return;
    setRerunning(true);
    window.setTimeout(() => setRerunning(false), 1600);
  };

  const handleCopy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedKey(key);
    window.setTimeout(
      () => setCopiedKey((k) => (k === key ? null : k)),
      1600,
    );
  };

  const passCount = useCountUp(roll.pass, summaryIn);
  const warnCount = useCountUp(roll.warn, summaryIn);
  const failCount = useCountUp(roll.fail, summaryIn);
  const readinessCount = useCountUp(roll.readiness, summaryIn, 1100);

  const verdictMeta = STATUS_META[roll.verdictStatus];

  return (
    <div className="space-y-5">
      {/* ───────── Report header / cover sheet ───────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        {/* Audit-stamp wash keyed to the verdict tone */}
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-[0.07] blur-xl ${verdictMeta.dot}`}
        />
        <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-accent">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                Inbox-delivery Audit
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-dim">
              <span>
                Sending domain{' '}
                <span className="font-medium text-text">{report.domain}</span>
              </span>
              <span className="text-border-muted">·</span>
              <span>{report.mailboxCount} mailboxes inspected</span>
              <span className="text-border-muted">·</span>
              <span>
                Run {fmtRanAt(report.ranAt)} in{' '}
                {(report.durationMs / 1000).toFixed(1)}s
              </span>
            </div>

            {/* Verdict line */}
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${verdictMeta.ring} ${verdictMeta.text}`}
            >
              <motion.span
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 320,
                  damping: 16,
                  delay: 0.2,
                }}
                className="flex"
              >
                <verdictMeta.Icon className="h-4 w-4" />
              </motion.span>
              {roll.verdict}
              <span className="font-normal text-text-dim">
                · {roll.pass}/{roll.total} checks passed
              </span>
            </div>
          </div>

          {/* Re-run audit */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleRerun}
              disabled={rerunning}
              className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2 text-sm font-medium text-text transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${rerunning ? 'animate-spin' : ''}`}
              />
              {rerunning ? 'Re-running…' : 'Re-run audit'}
            </button>
          </div>
        </div>

        {/* Summary strip — counts + weighted readiness, all reduced */}
        <div
          ref={summaryRef}
          className="grid grid-cols-2 gap-px border-t border-border-muted bg-border-muted lg:grid-cols-4"
        >
          <SummaryCell
            label="Checks passed"
            value={passCount}
            suffix={`/ ${roll.total}`}
            status="pass"
            Icon={CheckCircle2}
          />
          <SummaryCell
            label="Warnings"
            value={warnCount}
            suffix="to review"
            status="warn"
            Icon={ShieldAlert}
          />
          <SummaryCell
            label="Failures"
            value={failCount}
            suffix="blocking"
            status="fail"
            Icon={XCircle}
          />
          <div className="flex flex-col justify-center gap-1.5 bg-surface px-4 py-3.5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-text-dim">
              <span>Weighted readiness</span>
              <FileCheck2 className={`h-3.5 w-3.5 ${verdictMeta.text}`} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums leading-none text-text">
                {readinessCount}
              </span>
              <span className="text-xs text-text-dim">%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className={`h-full rounded-full ${verdictMeta.dot}`}
                initial={{ width: 0 }}
                animate={{ width: summaryIn ? `${roll.readiness}%` : 0 }}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
              />
            </div>
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ───────── Inspection sections ───────── */}
        <div className="space-y-3 xl:col-span-8">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
                Inspection sections
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setAll(!allOpen)}
              className="text-[11px] font-medium text-text-dim transition-colors hover:text-accent"
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          {report.sections.map((section, sIdx) => {
            const sr = sectionRollUp(section);
            const open = openSections[section.id] ?? false;
            const sMeta = STATUS_META[sr.worst];
            return (
              <motion.section
                key={section.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06 + sIdx * 0.07 }}
                className="overflow-hidden rounded-xl border border-border-muted bg-surface"
              >
                {/* Section header — click to expand/collapse */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50"
                  aria-expanded={open}
                >
                  <motion.span
                    animate={{ rotate: open ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex shrink-0 text-text-dim"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.span>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sMeta.ring} ${sMeta.text}`}
                  >
                    <section.Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text">
                        {section.title}
                      </h3>
                      {section.liveFeed && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <span className="relative inline-flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                          </span>
                          live-fed
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-text-dim">
                      {section.blurb}
                    </p>
                  </div>
                  {/* Mini pass/warn/fail tally for the section */}
                  <div className="hidden shrink-0 items-center gap-2 text-[11px] sm:flex">
                    <SectionTally n={sr.pass} status="pass" />
                    <SectionTally n={sr.warn} status="warn" />
                    <SectionTally n={sr.fail} status="fail" />
                  </div>
                </button>

                {/* Section body — animated height */}
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <ul className="divide-y divide-border-muted border-t border-border-muted">
                        {section.checks.map((check, cIdx) => (
                          <CheckRow
                            key={check.id}
                            check={check}
                            index={cIdx}
                            sectionOpen={open}
                            fixOpen={openFixes[check.id] ?? false}
                            onToggleFix={() => toggleFix(check.id)}
                            copiedKey={copiedKey}
                            onCopy={handleCopy}
                          />
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            );
          })}
        </div>

        {/* ───────── Evidence rail (Pro Plus unlock) ───────── */}
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-3 xl:col-span-4"
        >
          <div className="flex items-center gap-2 px-0.5">
            <Fingerprint className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
              Live evidence
            </h2>
          </div>

          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3">
            <p className="text-xs leading-relaxed text-text-dim">
              <span className="font-semibold text-accent">Pro Plus</span> feeds
              this audit from{' '}
              <span className="font-medium text-text">
                Google Postmaster
              </span>{' '}
              and{' '}
              <span className="font-medium text-text">Microsoft SNDS</span> —
              the raw signals every sender-trust &amp; opens-and-replies check above was
              evaluated against.
            </p>
          </div>

          {report.evidence.map((src, i) => (
            <motion.div
              key={src.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.26 + i * 0.08 }}
              className="overflow-hidden rounded-xl border border-border-muted bg-surface"
            >
              <header className="flex items-start justify-between gap-2 border-b border-border-muted px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <src.Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-text">
                      {src.name}
                    </h3>
                    <p className="truncate text-[11px] text-text-dim">
                      {src.sub}
                    </p>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-dim">
                  <RefreshCw className="h-3 w-3 text-accent" />
                  {src.syncedAgo}
                </span>
              </header>
              <div className="grid grid-cols-2 gap-px bg-border-muted">
                {src.metrics.map((m) => {
                  const mm = STATUS_META[m.status];
                  return (
                    <div key={m.label} className="bg-surface px-3 py-2.5">
                      <div className="truncate text-[10px] uppercase tracking-wide text-text-dim">
                        {m.label}
                      </div>
                      <div
                        className={`mt-1 flex items-center gap-1.5 text-sm font-semibold tabular-nums ${mm.text}`}
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${mm.dot}`}
                        />
                        {m.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}

          <div className="flex items-start gap-2 rounded-xl border border-border-muted bg-surface px-4 py-3 text-[11px] leading-relaxed text-text-dim">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            Evidence is pulled read-only over each provider's API. Login details
            stay encrypted at rest — the audit never stores raw mail content.
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCell({
  label,
  value,
  suffix,
  status,
  Icon,
}: {
  label: string;
  value: number;
  suffix: string;
  status: CheckStatus;
  Icon: typeof CheckCircle2;
}) {
  const m = STATUS_META[status];
  return (
    <div className="flex flex-col justify-center gap-1.5 bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-text-dim">
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${m.text}`} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular-nums leading-none ${m.text}`}>
          {value}
        </span>
        <span className="text-xs text-text-dim">{suffix}</span>
      </div>
    </div>
  );
}

function SectionTally({
  n,
  status,
}: {
  n: number;
  status: CheckStatus;
}) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 ${n > 0 ? m.text : 'text-text-dim opacity-50'}`}
      title={`${n} ${m.label.toLowerCase()}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${n > 0 ? m.dot : 'bg-border-muted'}`}
      />
      <span className="tabular-nums font-semibold">{n}</span>
    </span>
  );
}

function CheckRow({
  check,
  index,
  sectionOpen,
  fixOpen,
  onToggleFix,
  copiedKey,
  onCopy,
}: {
  check: AuditCheck;
  index: number;
  sectionOpen: boolean;
  fixOpen: boolean;
  onToggleFix: () => void;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const m = STATUS_META[check.status];
  const hasFix =
    !!check.remediation &&
    (check.status === 'warn' || check.status === 'fail');

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={sectionOpen ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
      transition={{ duration: 0.28, delay: 0.04 + index * 0.05 }}
      className="px-4 py-3"
    >
      <div className="flex items-start gap-3">
        {/* Status icon — pops in */}
        <motion.span
          initial={{ scale: 0 }}
          animate={sectionOpen ? { scale: 1 } : { scale: 0 }}
          transition={{
            type: 'spring',
            stiffness: 360,
            damping: 18,
            delay: 0.1 + index * 0.05,
          }}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${m.text}`}
          title={m.label}
        >
          <m.Icon className="h-5 w-5" />
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-text">{check.name}</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.ring} ${m.text}`}
            >
              {m.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-dim">{check.detail}</p>

          {/* Observed vs expected */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="text-text-dim">
              Observed{' '}
              <span className={`font-semibold tabular-nums ${m.text}`}>
                {check.observed}
              </span>
            </span>
            <span className="text-text-dim">
              Expected{' '}
              <span className="font-semibold tabular-nums text-text">
                {check.expected}
              </span>
            </span>
          </div>

          {/* Remediation toggle (warn/fail only) */}
          {hasFix && (
            <button
              type="button"
              onClick={onToggleFix}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${m.ring} ${m.text} hover:opacity-80`}
              aria-expanded={fixOpen}
            >
              <Wrench className="h-3 w-3" />
              {fixOpen ? 'Hide remediation' : 'How to fix'}
              <motion.span
                animate={{ rotate: fixOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex"
              >
                <ChevronRight className="h-3 w-3" />
              </motion.span>
            </button>
          )}
        </div>
      </div>

      {/* Remediation drawer — slides open */}
      <AnimatePresence initial={false}>
        {hasFix && fixOpen && check.remediation && (
          <motion.div
            key="fix"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="ml-8 mt-3 rounded-lg border border-border-muted bg-surface-2 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                <Wrench className="h-3 w-3" />
                Remediation
              </div>
              <ol className="space-y-1.5">
                {check.remediation.steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs leading-relaxed text-text-dim"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.ring} ${m.text}`}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {check.remediation.record && (
                <div className="mt-3 rounded-md border border-border-muted bg-bg">
                  <div className="flex items-center justify-between border-b border-border-muted px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                      Apply this {check.remediation.record.kind} record
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCopy(
                          check.id,
                          `${check.remediation!.record!.host}  ${check.remediation!.record!.kind}  ${check.remediation!.record!.value}`,
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-text-dim transition-colors hover:text-accent"
                    >
                      {copiedKey === check.id ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-accent" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <dl className="space-y-1 px-3 py-2 font-mono text-[11px] leading-relaxed">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-text-dim">Type</dt>
                      <dd className="text-text">
                        {check.remediation.record.kind}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-text-dim">Host</dt>
                      <dd className="break-all text-text">
                        {check.remediation.record.host}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-text-dim">Value</dt>
                      <dd className="break-all text-accent">
                        {check.remediation.record.value}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default ProPlusRep4Audit;
