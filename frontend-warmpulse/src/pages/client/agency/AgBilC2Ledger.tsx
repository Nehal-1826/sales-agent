import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, formatDate } from '@/lib/format';
import { toast } from '@/components/ui/AppToast';
import { exportRowsToCsv, exportStamp, type CsvColumn } from '@/lib/exportCsv';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { useQuickUpgrade } from '@/features/billing/api';
import { extractErrorMessage } from '@/lib/errors';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Filter,
  Loader2,
  Receipt,
  Search,
  SortAsc,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

/**
 * AgBilC2Ledger — Agency-tier BILLING surface #2, "Carousel Ledger".
 *
 * The /app/billing page for Agency-tier accounts. The agency owner is a
 * multi-tenant operator: they pay WarmPulse once for their seat AND collect
 * their own per-sub-client invoices that they want to reconcile against the
 * agency MRR. This surface treats billing as a horizontal LEDGER carousel —
 * a row of perforated receipt cards (one per sub-client) that the user
 * scrolls through with arrow buttons / mouse-wheel / swipe, plus a MRR top
 * strip and a full invoice table beneath.
 *
 * Stage anatomy (top → bottom):
 *   1. TOP STRIP — wide MRR sparkline (drawn-in left→right) + three KPI
 *      tiles (MRR / Quarter-to-Date / Year-to-Date with delta-pct chips) +
 *      a small "Spend Snapshot" donut to the right showing the spendBuckets.
 *   2. CAROUSEL — horizontally-scrolling row of RECEIPT CARDS, one per
 *      sub-client. Each card has perforated edges (dotted-cut top + bottom
 *      via inline SVG), monospaced amounts, status pill, next-due date.
 *      Cards SLIDE IN with stagger + slight rotation on first mount. Hover
 *      LIFTS the focused card; adjacent cards drift outward 4px. CLICK
 *      flips the card 180° to reveal that sub-client's invoice history on
 *      the reverse side. Left / right arrows + a dot-indicator strip drive
 *      navigation.
 *   3. INVOICE LEDGER TABLE — compact rows: date · number · sub-client
 *      logoChar+name · amount · status pill · PDF icon. Sortable by date /
 *      amount / status. Fade-up stagger on mount.
 *   4. FLOATING CHIP — bottom-right, agency's own next-bill notice.
 *
 * Distinct from sibling C1 / C3 / C4 billing variants: the CAROUSEL of
 * perforated paper-receipt cards is the signature metaphor here. NOT a
 * vault, NOT a calendar, NOT a flow diagram.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Renders only page content; the shell supplies sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency billing variants
// ---------------------------------------------------------------------------
// Shape duplicated across all 4 Agency billing variants — keep in sync.

type BillingStatus = 'paid' | 'pending' | 'overdue' | 'trial';
type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'failed';

export interface AgencyBillingData {
  agency: {
    name: string;
    plan: string;
    nextBillDate: string;
    billingEmail: string;
    paymentMethodLabel: string;
  };
  summary: {
    mrrUsd: number;
    quarterToDateUsd: number;
    yearToDateUsd: number;
    momGrowthPct: number;
    nextChargeUsd: number;
    overdueCountThisMonth: number;
  };
  subClientBilling: Array<{
    id: string;
    name: string;
    logoChar: string;
    plan: string;
    monthlyAmountUsd: number;
    status: BillingStatus;
    nextDueDate: string;
    lastPaidAgo: string;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    issueDate: string;
    amountUsd: number;
    status: InvoiceStatus;
    subClientId: string | null;
    pdfAvailable: boolean;
  }>;
  spendBuckets: Array<{
    id: string;
    label: string;
    amountUsd: number;
    deltaPct: number;
  }>;
}

// ---------------------------------------------------------------------------
// SKELETON — required export for empty / loading harness preview
// ---------------------------------------------------------------------------

export const AGENCY_BILLING_SKELETON_C2: AgencyBillingData = {
  agency: {
    name: 'Your agency',
    plan: 'Agency',
    nextBillDate: '',
    billingEmail: '',
    paymentMethodLabel: '',
  },
  summary: {
    mrrUsd: 0,
    quarterToDateUsd: 0,
    yearToDateUsd: 0,
    momGrowthPct: 0,
    nextChargeUsd: 0,
    overdueCountThisMonth: 0,
  },
  subClientBilling: [],
  invoices: [],
  spendBuckets: [],
};

// ---------------------------------------------------------------------------
// MOCK
// ---------------------------------------------------------------------------

const MOCK: AgencyBillingData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    nextBillDate: 'Jun 14, 2026',
    billingEmail: 'billing@northwind.agency',
    paymentMethodLabel: 'Visa •••• 4242',
  },
  summary: {
    mrrUsd: 5780,
    quarterToDateUsd: 17300,
    yearToDateUsd: 62400,
    momGrowthPct: 9.6,
    nextChargeUsd: 2200,
    overdueCountThisMonth: 1,
  },
  subClientBilling: [
    {
      id: 'helix',
      name: 'Helix Outbound',
      logoChar: 'H',
      plan: 'Pro Plus',
      monthlyAmountUsd: 1480,
      status: 'paid',
      nextDueDate: 'Jun 12, 2026',
      lastPaidAgo: '12 days ago',
    },
    {
      id: 'nimbus',
      name: 'Nimbus Reach',
      logoChar: 'N',
      plan: 'Pro Plus',
      monthlyAmountUsd: 1120,
      status: 'paid',
      nextDueDate: 'Jun 14, 2026',
      lastPaidAgo: '10 days ago',
    },
    {
      id: 'orion',
      name: 'Orion Mail',
      logoChar: 'O',
      plan: 'Pro',
      monthlyAmountUsd: 980,
      status: 'paid',
      nextDueDate: 'Jun 16, 2026',
      lastPaidAgo: '8 days ago',
    },
    {
      id: 'vega',
      name: 'Vega Sends',
      logoChar: 'V',
      plan: 'Pro',
      monthlyAmountUsd: 740,
      status: 'paid',
      nextDueDate: 'Jun 18, 2026',
      lastPaidAgo: '6 days ago',
    },
    {
      id: 'quasar',
      name: 'Quasar Studio',
      logoChar: 'Q',
      plan: 'Pro',
      monthlyAmountUsd: 520,
      status: 'paid',
      nextDueDate: 'Jun 19, 2026',
      lastPaidAgo: '5 days ago',
    },
    {
      id: 'lyra',
      name: 'Lyra Pipeline',
      logoChar: 'L',
      plan: 'Starter',
      monthlyAmountUsd: 360,
      status: 'pending',
      nextDueDate: 'Jun 02, 2026',
      lastPaidAgo: '34 days ago',
    },
    {
      id: 'atlas',
      name: 'Atlas Reach',
      logoChar: 'A',
      plan: 'Starter',
      monthlyAmountUsd: 240,
      status: 'overdue',
      nextDueDate: 'May 22, 2026',
      lastPaidAgo: '58 days ago',
    },
    {
      id: 'pixel',
      name: 'Pixel Drop',
      logoChar: 'P',
      plan: 'Trial',
      monthlyAmountUsd: 180,
      status: 'trial',
      nextDueDate: 'Jun 28, 2026',
      lastPaidAgo: '—',
    },
  ],
  invoices: [
    {
      id: 'inv-1042',
      number: 'WP-INV-2026-1042',
      issueDate: '2026-05-14',
      amountUsd: 1480,
      status: 'paid',
      subClientId: 'helix',
      pdfAvailable: true,
    },
    {
      id: 'inv-1041',
      number: 'WP-INV-2026-1041',
      issueDate: '2026-05-14',
      amountUsd: 1120,
      status: 'paid',
      subClientId: 'nimbus',
      pdfAvailable: true,
    },
    {
      id: 'inv-1040',
      number: 'WP-INV-2026-1040',
      issueDate: '2026-05-14',
      amountUsd: 980,
      status: 'paid',
      subClientId: 'orion',
      pdfAvailable: true,
    },
    {
      id: 'inv-1039',
      number: 'WP-INV-2026-1039',
      issueDate: '2026-05-14',
      amountUsd: 740,
      status: 'paid',
      subClientId: 'vega',
      pdfAvailable: true,
    },
    {
      id: 'inv-1038',
      number: 'WP-INV-2026-1038',
      issueDate: '2026-05-14',
      amountUsd: 520,
      status: 'paid',
      subClientId: 'quasar',
      pdfAvailable: true,
    },
    {
      id: 'inv-1037',
      number: 'WP-INV-2026-1037',
      issueDate: '2026-05-14',
      amountUsd: 2200,
      status: 'paid',
      subClientId: null,
      pdfAvailable: true,
    },
    {
      id: 'inv-1036',
      number: 'WP-INV-2026-1036',
      issueDate: '2026-05-30',
      amountUsd: 360,
      status: 'pending',
      subClientId: 'lyra',
      pdfAvailable: false,
    },
    {
      id: 'inv-1035',
      number: 'WP-INV-2026-1035',
      issueDate: '2026-05-22',
      amountUsd: 180,
      status: 'pending',
      subClientId: 'pixel',
      pdfAvailable: false,
    },
    {
      id: 'inv-1034',
      number: 'WP-INV-2026-1034',
      issueDate: '2026-04-22',
      amountUsd: 240,
      status: 'overdue',
      subClientId: 'atlas',
      pdfAvailable: true,
    },
    {
      id: 'inv-1033',
      number: 'WP-INV-2026-1033',
      issueDate: '2026-04-14',
      amountUsd: 320,
      status: 'failed',
      subClientId: 'atlas',
      pdfAvailable: false,
    },
  ],
  spendBuckets: [
    { id: 'peer', label: 'Helper group', amountUsd: 1820, deltaPct: 4 },
    { id: 'compute', label: 'Compute', amountUsd: 960, deltaPct: -2 },
    { id: 'llm', label: 'AI tokens', amountUsd: 640, deltaPct: 18 },
    { id: 'support', label: 'Support', amountUsd: 220, deltaPct: 0 },
  ],
};

// ---------------------------------------------------------------------------
// Synthetic MRR trail — 14 weekly points
// ---------------------------------------------------------------------------

const MRR_TRAIL: number[] = [
  3200, 3450, 3600, 3820, 3970, 4180, 4310, 4520, 4680, 4910, 5100, 5320, 5580, 5780,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtUsd = (n: number): string => formatMoney(n);

const fmtMonthDay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
};

const STATUS_TONE: Record<BillingStatus, string> = {
  paid: 'text-accent',
  pending: 'text-accent4',
  overdue: 'text-accent3',
  trial: 'text-accent2',
};

const STATUS_BG: Record<BillingStatus, string> = {
  paid: 'bg-accent/15',
  pending: 'bg-accent4/15',
  overdue: 'bg-accent3/15',
  trial: 'bg-accent2/15',
};

const STATUS_LABEL: Record<BillingStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
  trial: 'Trial',
};

const INVOICE_TONE: Record<InvoiceStatus, string> = {
  paid: 'text-accent',
  pending: 'text-accent4',
  overdue: 'text-accent3',
  failed: 'text-accent3',
};

const INVOICE_BG: Record<InvoiceStatus, string> = {
  paid: 'bg-accent/15',
  pending: 'bg-accent4/15',
  overdue: 'bg-accent3/15',
  failed: 'bg-accent3/15',
};

const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
  failed: 'Failed',
};

const STATUS_ICON: Record<BillingStatus, typeof CheckCircle2> = {
  paid: CheckCircle2,
  pending: Clock,
  overdue: AlertCircle,
  trial: Clock,
};

// CSV column spec shared by every invoice-export control on this surface.
type InvoiceRow = AgencyBillingData['invoices'][number];

function invoiceCsvColumns(
  subById: Map<string, AgencyBillingData['subClientBilling'][number]>,
): CsvColumn<InvoiceRow>[] {
  return [
    { header: 'Invoice', value: (r) => r.number },
    { header: 'Issue date', value: (r) => r.issueDate },
    {
      header: 'Sub-client',
      value: (r) => (r.subClientId ? (subById.get(r.subClientId)?.name ?? r.subClientId) : 'Agency plan'),
    },
    { header: 'Amount (USD)', value: (r) => r.amountUsd },
    { header: 'Status', value: (r) => r.status },
  ];
}

function exportInvoices(
  filename: string,
  rows: InvoiceRow[],
  subs: AgencyBillingData['subClientBilling'],
): void {
  const subById = new Map(subs.map((s) => [s.id, s]));
  const count = exportRowsToCsv(filename, rows, invoiceCsvColumns(subById));
  toast.success(`Exported ${count} invoice${count === 1 ? '' : 's'}`);
}

// Build the SVG sparkline polyline for MRR.
function buildSparklinePath(trail: number[], w: number, h: number): string {
  if (trail.length === 0) return '';
  const max = Math.max(...trail);
  const min = Math.min(...trail);
  const span = max - min || 1;
  const stepX = w / Math.max(1, trail.length - 1);
  return trail
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

// Build the SVG area path (same as line but closes to baseline).
function buildSparklineArea(trail: number[], w: number, h: number): string {
  if (trail.length === 0) return '';
  const line = buildSparklinePath(trail, w, h);
  if (line === '') return '';
  return `${line} L ${w.toFixed(2)} ${h.toFixed(2)} L 0 ${h.toFixed(2)} Z`;
}

// ---------------------------------------------------------------------------
// Perforated-edge SVG (top + bottom dotted cuts for receipt cards)
// ---------------------------------------------------------------------------

interface PerforationProps {
  width: number;
  side: 'top' | 'bottom';
}

function Perforation({ width, side }: PerforationProps): JSX.Element {
  // Render a row of small semi-circles cut into the card edge to mimic a
  // tear-off receipt. Implemented as a pair of arcs along the edge.
  const radius = 4;
  const gap = 12;
  const count = Math.max(2, Math.floor(width / (radius * 2 + gap)));
  const stepX = width / count;
  const arcs: JSX.Element[] = [];
  for (let i = 0; i <= count; i += 1) {
    const cx = i * stepX;
    arcs.push(
      <circle
        key={i}
        cx={cx}
        cy={side === 'top' ? 0 : 16}
        r={radius}
        className="fill-bg"
      />,
    );
  }
  return (
    <svg
      width={width}
      height={16}
      viewBox={`0 0 ${width} 16`}
      className="block pointer-events-none"
      aria-hidden
    >
      {arcs}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function PageHeader({
  agency,
  invoices,
  subs,
}: {
  agency: AgencyBillingData['agency'];
  invoices: AgencyBillingData['invoices'];
  subs: AgencyBillingData['subClientBilling'];
}): JSX.Element {
  const navigate = useNavigate();
  const quickUpgrade = useQuickUpgrade();

  const handleQuickUpgrade = async (planId: string) => {
    try {
      await quickUpgrade.mutateAsync(planId);
      toast.success('Plan updated successfully.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update plan.'));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
    >
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-text-faint">
          <Receipt className="h-3.5 w-3.5" />
          <span>Agency ledger</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-text">Billing</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-dim">
          <span>{agency.name}</span>
          <span className="text-border-muted">·</span>
          <div className="relative inline-flex items-center">
            <select
              value={agency.plan.toLowerCase().replace(' ', '_')}
              onChange={(e) => handleQuickUpgrade(e.target.value)}
              disabled={quickUpgrade.isPending}
              className="bg-transparent font-semibold text-text underline decoration-dotted underline-offset-4 appearance-none pr-4 cursor-pointer focus:outline-none"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="pro_plus">Pro Plus</option>
              <option value="agency">Agency</option>
            </select>
            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim" />
          </div>
          {quickUpgrade.isPending && <Loader2 size={12} className="animate-spin text-accent" />}
          <span className="text-border-muted">·</span>
          <span>billing@</span>
          <span className="text-text">{agency.billingEmail.split('@')[1] ?? ''}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/app/billing')}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-muted bg-surface px-3 text-xs font-medium text-text-dim transition-colors hover:border-accent/60 hover:text-text"
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>{agency.paymentMethodLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => exportInvoices(`agency-ledger-${exportStamp()}`, invoices, subs)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-muted bg-surface px-3 text-xs font-medium text-text-dim transition-colors hover:border-accent/60 hover:text-text"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export ledger</span>
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Top strip — sparkline + KPI tiles + donut
// ---------------------------------------------------------------------------

interface SparklineProps {
  trail: number[];
  width: number;
  height: number;
}

// Synthetic week labels for the MRR trail tooltip — mirror the 14-point dataset.
const MRR_WEEK_LABELS: string[] = [
  'Feb 16', 'Feb 23', 'Mar 02', 'Mar 09', 'Mar 16', 'Mar 23', 'Mar 30',
  'Apr 06', 'Apr 13', 'Apr 20', 'Apr 27', 'May 04', 'May 11', 'May 18',
];

function MrrSparkline({ trail, width, height }: SparklineProps): JSX.Element {
  const path = useMemo(() => buildSparklinePath(trail, width, height), [trail, width, height]);
  const area = useMemo(() => buildSparklineArea(trail, width, height), [trail, width, height]);
  const lastIndex = trail.length - 1;
  const max = Math.max(...trail);
  const min = Math.min(...trail);
  const span = max - min || 1;
  const stepX = width / Math.max(1, trail.length - 1);
  const lastVal = trail[lastIndex] ?? 0;
  const lastY = height - ((lastVal - min) / span) * (height - 8) - 4;
  const lastX = lastIndex * stepX;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const xAt = (i: number): number => i * stepX;
  const yAt = (v: number): number => height - ((v - min) / span) * (height - 8) - 4;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Map screen-space x to viewBox-space x (svg uses preserveAspectRatio default).
    const vbX = (x / rect.width) * width;
    const idx = Math.round(vbX / stepX);
    setHoverIdx(Math.max(0, Math.min(trail.length - 1, idx)));
  };

  // Tooltip placement: keep within bounds.
  const TT_W = 96;
  const TT_H = 36;
  const tooltipX =
    hoverIdx === null
      ? 0
      : Math.min(width - TT_W, Math.max(0, xAt(hoverIdx) - TT_W / 2));
  const tooltipY =
    hoverIdx === null ? 0 : Math.max(0, yAt(trail[hoverIdx] ?? 0) - TT_H - 10);

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="mrr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Baseline gridlines */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={0}
            x2={width}
            y1={height * p}
            y2={height * p}
            className="stroke-border-muted/40"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}
        {/* Filled area */}
        <motion.path
          d={area}
          className="text-accent"
          fill="url(#mrr-fill)"
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        />
        {/* Drawing line */}
        <motion.path
          d={path}
          className="text-accent"
          stroke="currentColor"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
        {/* Endpoint dot (hidden while hovering) */}
        {hoverIdx === null ? (
          <>
            <motion.circle
              cx={lastX}
              cy={lastY}
              r={4}
              className="fill-accent"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, type: 'spring', stiffness: 220 }}
            />
            <motion.circle
              cx={lastX}
              cy={lastY}
              r={9}
              className="fill-accent/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ delay: 1.3, duration: 0.4 }}
            />
          </>
        ) : null}
        {/* Cursor-tracking overlay */}
        {hoverIdx !== null ? (
          <g pointerEvents="none">
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={0}
              y2={height}
              className="stroke-accent/60"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(trail[hoverIdx] ?? 0)}
              r={4}
              className="fill-accent"
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(trail[hoverIdx] ?? 0)}
              r={8}
              className="fill-accent/25"
            />
            <foreignObject x={tooltipX} y={tooltipY} width={TT_W} height={TT_H}>
              <div
                className="rounded-md border border-border-muted bg-surface-2 px-2 py-1"
                style={{ fontSize: 10, lineHeight: 1.2 }}
              >
                <div className="text-text-faint" style={{ fontSize: 9 }}>
                  {MRR_WEEK_LABELS[hoverIdx] ?? `Wk ${hoverIdx + 1}`}
                </div>
                <div className="font-mono font-semibold text-text">
                  {fmtUsd(trail[hoverIdx] ?? 0)}
                </div>
              </div>
            </foreignObject>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  delta?: number | null;
  icon: typeof DollarSign;
  accent: string;
}

function KpiTile({ label, value, delta, icon: Icon, accent }: KpiTileProps): JSX.Element {
  const showDelta = delta !== null && delta !== undefined;
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-lg border border-border-muted bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-faint">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xl font-semibold text-text">{value}</span>
        {showDelta ? (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px] font-medium ${
              positive ? 'bg-accent/15 text-accent' : 'bg-accent3/15 text-accent3'
            }`}
          >
            {positive ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {Math.abs(delta ?? 0).toFixed(1)}%
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Donut — spend snapshot
// ---------------------------------------------------------------------------

interface DonutProps {
  buckets: AgencyBillingData['spendBuckets'];
}

function SpendDonut({ buckets }: DonutProps): JSX.Element {
  const total = useMemo(
    () => buckets.reduce((sum, b) => sum + b.amountUsd, 0),
    [buckets],
  );

  const arcs = useMemo(() => {
    const radius = 38;
    const stroke = 12;
    const c = 2 * Math.PI * radius;
    let offset = 0;
    const tones = ['text-accent', 'text-accent2', 'text-accent4', 'text-text-dim'];
    return buckets.map((b, i) => {
      const frac = total > 0 ? b.amountUsd / total : 0;
      const length = c * frac;
      const tone = tones[i % tones.length] ?? 'text-accent';
      const arc = {
        bucket: b,
        radius,
        stroke,
        length,
        gap: Math.max(0.5, c - length),
        offset,
        tone,
      };
      offset -= length;
      return arc;
    });
  }, [buckets, total]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
      className="rounded-lg border border-border-muted bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
          Spend snapshot
        </span>
        <span className="text-[10px] text-text-faint">This month</span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[100px] w-[100px] shrink-0">
          <svg
            viewBox="0 0 100 100"
            width={100}
            height={100}
            className="-rotate-90 transform"
            aria-hidden
          >
            <circle
              cx={50}
              cy={50}
              r={38}
              stroke="currentColor"
              strokeWidth={12}
              fill="none"
              className="text-surface-2"
            />
            {arcs.map((a, i) => (
              <motion.circle
                key={a.bucket.id}
                cx={50}
                cy={50}
                r={a.radius}
                stroke="currentColor"
                strokeWidth={a.stroke}
                fill="none"
                strokeLinecap="butt"
                className={a.tone}
                initial={{ strokeDasharray: `0 ${2 * Math.PI * a.radius}` }}
                animate={{
                  strokeDasharray: `${a.length} ${a.gap}`,
                  strokeDashoffset: a.offset,
                }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.6, ease: 'easeOut' }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[10px] text-text-faint">total</span>
            <span className="font-mono text-sm font-semibold text-text">
              {fmtUsd(total)}
            </span>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5">
          {arcs.map((a) => (
            <li
              key={a.bucket.id}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="flex items-center gap-1.5 text-text-dim">
                <span className={`h-2 w-2 rounded-sm ${a.tone} bg-current`} />
                {a.bucket.label}
              </span>
              <span className="font-mono text-text">{fmtUsd(a.bucket.amountUsd)}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Top strip composite
// ---------------------------------------------------------------------------

interface TopStripProps {
  summary: AgencyBillingData['summary'];
  buckets: AgencyBillingData['spendBuckets'];
}

function TopStrip({ summary, buckets }: TopStripProps): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* LEFT — sparkline + KPI row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="rounded-lg border border-border-muted bg-surface p-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
              MRR trail · 14 weeks
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              <TrendingUp className="h-2.5 w-2.5" />
              {summary.momGrowthPct.toFixed(1)}% MoM
            </span>
          </div>
          <div className="hidden text-[11px] text-text-faint md:block">
            Next charge {fmtUsd(summary.nextChargeUsd)}
          </div>
        </div>
        <div className="mt-3 overflow-hidden text-accent">
          <MrrSparkline trail={MRR_TRAIL} width={620} height={88} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <KpiTile
            label="Current MRR"
            value={fmtUsd(summary.mrrUsd)}
            delta={summary.momGrowthPct}
            icon={DollarSign}
            accent="text-accent"
          />
          <KpiTile
            label="Quarter to date"
            value={fmtUsd(summary.quarterToDateUsd)}
            delta={6.2}
            icon={TrendingUp}
            accent="text-accent2"
          />
          <KpiTile
            label="Year to date"
            value={fmtUsd(summary.yearToDateUsd)}
            delta={14.8}
            icon={TrendingUp}
            accent="text-accent4"
          />
        </div>
      </motion.div>
      {/* RIGHT — spend donut */}
      <SpendDonut buckets={buckets} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipt card (front + back via 3D flip)
// ---------------------------------------------------------------------------

interface ReceiptCardProps {
  sub: AgencyBillingData['subClientBilling'][number];
  invoices: AgencyBillingData['invoices'];
  index: number;
  active: boolean;
  hovered: boolean;
  flipped: boolean;
  onHover: (hover: boolean) => void;
  onClick: () => void;
  drift: number;
}

const CARD_WIDTH = 280;
const CARD_HEIGHT = 360;

function ReceiptCardFront({
  sub,
}: {
  sub: AgencyBillingData['subClientBilling'][number];
}): JSX.Element {
  const StatusIcon = STATUS_ICON[sub.status];
  return (
    <div
      className="absolute inset-0 flex flex-col rounded-lg border border-border-muted bg-surface"
      style={{ backfaceVisibility: 'hidden' }}
    >
      {/* Perforated top edge */}
      <div className="-mt-2 px-4 text-accent">
        <Perforation width={CARD_WIDTH - 32} side="top" />
      </div>

      {/* Header */}
      <div className="px-5 pt-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md border border-border-muted bg-surface-2 font-mono text-sm font-semibold text-text">
              {sub.logoChar}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text">{sub.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
                {sub.plan} plan
              </div>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BG[sub.status]} ${STATUS_TONE[sub.status]}`}
          >
            <StatusIcon className="h-2.5 w-2.5" />
            {STATUS_LABEL[sub.status]}
          </span>
        </div>
      </div>

      {/* Dotted divider */}
      <div className="my-4 mx-5 border-t border-dashed border-border-muted" />

      {/* Amount block (large monospace) */}
      <div className="px-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
          Monthly amount
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-3xl font-semibold text-text">
            {fmtUsd(sub.monthlyAmountUsd)}
          </span>
          <span className="text-[11px] text-text-faint">/ mo</span>
        </div>
      </div>

      {/* Receipt-style line items */}
      <div className="mt-4 px-5 font-mono text-[11px]">
        <div className="flex justify-between border-b border-dashed border-border-muted py-1.5">
          <span className="text-text-dim">Plan fee</span>
          <span className="text-text">{fmtUsd(sub.monthlyAmountUsd * 0.78)}</span>
        </div>
        <div className="flex justify-between border-b border-dashed border-border-muted py-1.5">
          <span className="text-text-dim">Helper group</span>
          <span className="text-text">{fmtUsd(sub.monthlyAmountUsd * 0.16)}</span>
        </div>
        <div className="flex justify-between border-b border-dashed border-border-muted py-1.5">
          <span className="text-text-dim">Add-ons</span>
          <span className="text-text">{fmtUsd(sub.monthlyAmountUsd * 0.06)}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="font-medium uppercase tracking-wider text-text">Total</span>
          <span className="font-semibold text-text">
            {fmtUsd(sub.monthlyAmountUsd)}
          </span>
        </div>
      </div>

      {/* Footer dates */}
      <div className="mt-auto px-5 pb-3">
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-text-faint">Next due</div>
            <div className="mt-0.5 font-mono text-[11px] text-text">{sub.nextDueDate}</div>
          </div>
          <div>
            <div className="text-text-faint">Last paid</div>
            <div className="mt-0.5 font-mono text-[11px] text-text">{sub.lastPaidAgo}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-text-faint">
          <span className="font-mono">RCPT-{sub.id.slice(0, 6).toUpperCase()}</span>
          <span>Tap to flip</span>
        </div>
      </div>

      {/* Perforated bottom edge */}
      <div className="-mb-2 px-4 text-accent">
        <Perforation width={CARD_WIDTH - 32} side="bottom" />
      </div>
    </div>
  );
}

function ReceiptCardBack({
  sub,
  invoices,
}: {
  sub: AgencyBillingData['subClientBilling'][number];
  invoices: AgencyBillingData['invoices'];
}): JSX.Element {
  const history = useMemo(
    () => invoices.filter((inv) => inv.subClientId === sub.id),
    [invoices, sub.id],
  );
  // Synthesize the last 5 historical months for richer back-side detail.
  const synthHistory = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
    return months.map((m, i) => ({
      label: `${m} 2026`,
      amount: sub.monthlyAmountUsd * (0.92 + (i % 3) * 0.04),
      status: i === 4 ? sub.status : ('paid' as BillingStatus),
    }));
  }, [sub]);
  return (
    <div
      className="absolute inset-0 flex flex-col rounded-lg border border-accent/60 bg-surface-2"
      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
    >
      <div className="-mt-2 px-4 text-accent">
        <Perforation width={CARD_WIDTH - 32} side="top" />
      </div>
      <div className="px-5 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
              History · {sub.name}
            </span>
          </div>
          <span className="text-[10px] text-text-faint">Tap to flip</span>
        </div>
      </div>
      <div className="my-3 mx-5 border-t border-dashed border-border-muted" />
      <div className="px-5 flex-1 overflow-hidden">
        <ul className="space-y-2 font-mono text-[11px]">
          {synthHistory.map((row, i) => (
            <li
              key={`${sub.id}-h-${i}`}
              className="flex items-center justify-between rounded-sm bg-surface px-2 py-1.5"
            >
              <span className="text-text-dim">{row.label}</span>
              <span className="text-text">{fmtUsd(row.amount)}</span>
              <span
                className={`ml-2 inline-flex h-4 items-center rounded-sm px-1 text-[9px] uppercase ${STATUS_BG[row.status]} ${STATUS_TONE[row.status]}`}
              >
                {STATUS_LABEL[row.status]}
              </span>
            </li>
          ))}
        </ul>
        {history.length > 0 ? (
          <>
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-text-faint">
              Recent invoices
            </div>
            <ul className="mt-1.5 space-y-1 font-mono text-[10px]">
              {history.slice(0, 3).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between text-text-dim"
                >
                  <span>{inv.number}</span>
                  <span className="text-text">{fmtUsd(inv.amountUsd)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div className="px-5 pb-3">
        <div className="flex items-center justify-between text-[10px]">
          <button
            type="button"
            onClick={() =>
              exportInvoices(`${sub.id}-invoices-${exportStamp()}`, history, [sub])
            }
            className="inline-flex items-center gap-1 text-accent transition-colors hover:text-text"
          >
            <Download className="h-3 w-3" />
            All PDFs
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href);
              toast.success('Copied');
            }}
            className="inline-flex items-center gap-1 text-text-dim transition-colors hover:text-text"
          >
            <Copy className="h-3 w-3" />
            Copy URL
          </button>
        </div>
      </div>
      <div className="-mb-2 px-4 text-accent">
        <Perforation width={CARD_WIDTH - 32} side="bottom" />
      </div>
    </div>
  );
}

function ReceiptCard({
  sub,
  invoices,
  index,
  active,
  hovered,
  flipped,
  onHover,
  onClick,
  drift,
}: ReceiptCardProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, x: 60, rotate: -3 }}
      animate={{
        opacity: 1,
        x: drift,
        rotate: 0,
        y: hovered ? -8 : 0,
        scale: active ? 1 : 0.97,
      }}
      transition={{
        delay: index * 0.08,
        type: 'spring',
        stiffness: 180,
        damping: 22,
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
      className="relative shrink-0 cursor-pointer select-none"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        perspective: 1200,
      }}
    >
      {/* Hover glow underlay */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute -inset-2 -z-10 rounded-xl bg-accent/10 blur-xl"
      />
      {/* Active ring underlay */}
      {active ? (
        <motion.div
          layoutId="receipt-active-ring"
          className="absolute -inset-1 -z-10 rounded-xl border border-accent/60"
        />
      ) : null}
      {/* 3D flip container */}
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <ReceiptCardFront sub={sub} />
        <ReceiptCardBack sub={sub} invoices={invoices} />
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Carousel (scrollable strip + arrows + dots)
// ---------------------------------------------------------------------------

interface CarouselProps {
  subs: AgencyBillingData['subClientBilling'];
  invoices: AgencyBillingData['invoices'];
}

function Carousel({ subs, invoices }: CarouselProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [flippedId, setFlippedId] = useState<string | null>(null);

  // Track scroll position to drive the dot indicator.
  const scrollProgress = useMotionValue(0);
  const smoothedProgress = useSpring(scrollProgress, { stiffness: 180, damping: 22 });

  const recomputeActive = () => {
    const el = scrollRef.current;
    if (!el || subs.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    // Each card is CARD_WIDTH + gap (24px); leading padding 16px.
    const stride = CARD_WIDTH + 24;
    const i = Math.max(0, Math.min(subs.length - 1, Math.round((center - 16 - CARD_WIDTH / 2) / stride)));
    setActiveIdx(i);
    const max = el.scrollWidth - el.clientWidth;
    scrollProgress.set(max > 0 ? el.scrollLeft / max : 0);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => recomputeActive();
    el.addEventListener('scroll', handler, { passive: true });
    recomputeActive();
    return () => el.removeEventListener('scroll', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs.length]);

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const stride = CARD_WIDTH + 24;
    el.scrollBy({ left: dir * stride * 2, behavior: 'smooth' });
  };

  const scrollToIdx = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const stride = CARD_WIDTH + 24;
    el.scrollTo({ left: idx * stride, behavior: 'smooth' });
  };

  // Wheel-to-horizontal-scroll translation.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only re-route vertical wheel deltas; trackpads with horizontal delta
      // already scroll the strip natively.
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollBy({ left: e.deltaY, behavior: 'auto' });
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onCardClick = (id: string) => {
    setFlippedId((cur) => (cur === id ? null : id));
  };

  return (
    <div className="relative">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Sub-client ledger</h2>
          <span className="text-[11px] text-text-faint">{subs.length} accounts</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent/60 hover:text-text"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent/60 hover:text-text"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Strip */}
      <div className="relative">
        {/* Gradient edge masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg to-transparent" />
        <div
          ref={scrollRef}
          className="scrollbar-none flex gap-6 overflow-x-auto px-4 py-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {subs.map((sub, i) => {
            const hovered = hoveredIdx === i;
            const drift =
              hoveredIdx === null
                ? 0
                : hoveredIdx === i
                  ? 0
                  : i < hoveredIdx
                    ? -4
                    : 4;
            return (
              <ReceiptCard
                key={sub.id}
                sub={sub}
                invoices={invoices}
                index={i}
                active={activeIdx === i}
                hovered={hovered}
                flipped={flippedId === sub.id}
                onHover={(h) => setHoveredIdx(h ? i : null)}
                onClick={() => onCardClick(sub.id)}
                drift={drift}
              />
            );
          })}
        </div>
      </div>

      {/* Dot indicator */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {subs.map((sub, i) => (
          <button
            key={sub.id}
            type="button"
            onClick={() => scrollToIdx(i)}
            className={`group rounded-full transition-all ${
              activeIdx === i
                ? 'h-1.5 w-6 bg-accent'
                : 'h-1.5 w-1.5 bg-border-muted hover:bg-text-dim'
            }`}
            aria-label={`Jump to ${sub.name}`}
          />
        ))}
      </div>

      {/* Scroll progress hint */}
      <motion.div
        style={{ scaleX: smoothedProgress }}
        className="mx-auto mt-2 h-0.5 w-32 origin-left rounded-full bg-accent/40"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice ledger table (sortable + animated)
// ---------------------------------------------------------------------------

type SortField = 'date' | 'amount' | 'status' | 'number';
type SortDir = 'asc' | 'desc';

interface InvoiceLedgerProps {
  invoices: AgencyBillingData['invoices'];
  subs: AgencyBillingData['subClientBilling'];
}

function InvoiceLedger({ invoices, subs }: InvoiceLedgerProps): JSX.Element {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [query, setQuery] = useState<string>('');

  const subById = useMemo(() => {
    const m = new Map<string, AgencyBillingData['subClientBilling'][number]>();
    subs.forEach((s) => m.set(s.id, s));
    return m;
  }, [subs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (q.length > 0) {
        const sub = inv.subClientId ? subById.get(inv.subClientId) : null;
        const hay = [inv.number, sub?.name ?? '', inv.amountUsd.toString()]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, query, statusFilter, subById]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mul = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortField === 'date') {
        return mul * (new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
      }
      if (sortField === 'amount') return mul * (a.amountUsd - b.amountUsd);
      if (sortField === 'status') return mul * a.status.localeCompare(b.status);
      return mul * a.number.localeCompare(b.number);
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(f);
      setSortDir('desc');
    }
  };

  // Aggregated totals
  const totals = useMemo(() => {
    const paid = filtered
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + i.amountUsd, 0);
    const pending = filtered
      .filter((i) => i.status === 'pending')
      .reduce((s, i) => s + i.amountUsd, 0);
    const overdue = filtered
      .filter((i) => i.status === 'overdue' || i.status === 'failed')
      .reduce((s, i) => s + i.amountUsd, 0);
    return { paid, pending, overdue };
  }, [filtered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}
      className="rounded-lg border border-border-muted bg-surface"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border-muted px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Invoice ledger</h2>
          <span className="text-[11px] text-text-faint">
            {sorted.length} of {invoices.length} entries
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter invoices"
              className="h-8 w-56 rounded-md border border-border-muted bg-bg pl-7 pr-2 text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <FilterChip
            label="All"
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <FilterChip
            label="Paid"
            active={statusFilter === 'paid'}
            onClick={() => setStatusFilter('paid')}
            tone="accent"
          />
          <FilterChip
            label="Pending"
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
            tone="accent4"
          />
          <FilterChip
            label="Overdue"
            active={statusFilter === 'overdue'}
            onClick={() => setStatusFilter('overdue')}
            tone="accent3"
          />
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid gap-3 border-b border-border-muted px-5 py-3 md:grid-cols-3">
        <TotalsTile label="Paid" amount={totals.paid} tone="accent" />
        <TotalsTile label="Pending" amount={totals.pending} tone="accent4" />
        <TotalsTile label="Overdue / failed" amount={totals.overdue} tone="accent3" />
      </div>

      {/* Table head + rows scroll horizontally on narrow viewports so columns
          never crush their content. */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Table head */}
          <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(150px,1fr)_110px_110px_60px] gap-3 border-b border-border-muted px-5 py-2 text-[10px] uppercase tracking-[0.18em] text-text-faint">
            <SortHeader
              label="Date"
              field="date"
              active={sortField === 'date'}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <SortHeader
              label="Number"
              field="number"
              active={sortField === 'number'}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <span>Sub-client</span>
            <SortHeader
              label="Amount"
              field="amount"
              active={sortField === 'amount'}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <SortHeader
              label="Status"
              field="status"
              active={sortField === 'status'}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <span className="text-right">PDF</span>
          </div>

          {/* Rows */}
          <ul className="divide-y divide-border-muted">
            <AnimatePresence initial>
              {sorted.length === 0 ? (
                <motion.li
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-5 py-10 text-center text-xs text-text-faint"
                >
                  No invoices match your filter.
                </motion.li>
              ) : (
                sorted.map((inv, i) => {
                  const sub = inv.subClientId ? subById.get(inv.subClientId) : null;
                  return (
                    <motion.li
                      key={inv.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                      className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(150px,1fr)_110px_110px_60px] gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="font-mono text-[11px] text-text-dim">
                        {fmtMonthDay(inv.issueDate)}
                      </span>
                      <span className="truncate font-mono text-[11px] text-text">
                        {inv.number}
                      </span>
                      <span className="flex items-center gap-2 truncate text-xs">
                        {sub ? (
                          <>
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-border-muted bg-surface-2 font-mono text-[10px] font-semibold text-text">
                              {sub.logoChar}
                            </span>
                            <span className="truncate text-text-dim">{sub.name}</span>
                          </>
                        ) : (
                          <>
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-accent/60 bg-accent/10 font-mono text-[10px] font-semibold text-accent">
                              N
                            </span>
                            <span className="truncate text-text-dim">Agency plan</span>
                          </>
                        )}
                      </span>
                      <span className="font-mono text-xs text-text">
                        {fmtUsd(inv.amountUsd)}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${INVOICE_BG[inv.status]} ${INVOICE_TONE[inv.status]}`}
                        >
                          {INVOICE_LABEL[inv.status]}
                        </span>
                      </span>
                      <span className="flex items-center justify-end">
                        {inv.pdfAvailable ? (
                          <button
                            type="button"
                            onClick={() =>
                              exportInvoices(`${inv.number}-${exportStamp()}`, [inv], subs)
                            }
                            className="grid h-7 w-7 place-items-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent/60 hover:text-accent"
                            aria-label={`Download ${inv.number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-text-faint">—</span>
                        )}
                      </span>
                    </motion.li>
                  );
                })
              )}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'accent' | 'accent3' | 'accent4';
}

function FilterChip({ label, active, onClick, tone }: FilterChipProps): JSX.Element {
  const toneClass = active
    ? tone === 'accent'
      ? 'border-accent/60 bg-accent/10 text-accent'
      : tone === 'accent3'
        ? 'border-accent3/60 bg-accent3/10 text-accent3'
        : tone === 'accent4'
          ? 'border-accent4/60 bg-accent4/10 text-accent4'
          : 'border-accent/60 bg-accent/10 text-accent'
    : 'border-border-muted bg-surface text-text-dim hover:border-text-dim hover:text-text';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${toneClass}`}
    >
      <Filter className="h-3 w-3" />
      {label}
    </button>
  );
}

interface SortHeaderProps {
  label: string;
  field: SortField;
  active: boolean;
  dir: SortDir;
  onToggle: (f: SortField) => void;
}

function SortHeader({ label, field, active, dir, onToggle }: SortHeaderProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={`flex items-center gap-1 text-left transition-colors hover:text-text ${
        active ? 'text-text' : ''
      }`}
    >
      {label}
      <SortAsc
        className={`h-3 w-3 transition-transform ${
          active ? 'opacity-100' : 'opacity-40'
        } ${active && dir === 'desc' ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

interface TotalsTileProps {
  label: string;
  amount: number;
  tone: 'accent' | 'accent3' | 'accent4';
}

function TotalsTile({ label, amount, tone }: TotalsTileProps): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent3'
        ? 'text-accent3'
        : 'text-accent4';
  return (
    <div className="rounded-md border border-border-muted bg-bg px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
        {label}
      </div>
      <div className={`mt-1 font-mono text-base font-semibold ${toneClass}`}>
        {fmtUsd(amount)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating next-bill chip
// ---------------------------------------------------------------------------

interface NextBillChipProps {
  nextBillDate: string;
  amount: number;
  paymentMethod: string;
}

function NextBillChip({
  nextBillDate,
  amount,
  paymentMethod,
}: NextBillChipProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(true);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 1.4 }}
          className="fixed bottom-6 right-6 z-30 max-w-xs rounded-lg border border-accent/40 bg-surface-2 px-3 py-2.5 shadow-lg backdrop-blur"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-text-faint">
                Next bill
              </div>
              <div className="mt-0.5 text-xs text-text">
                <span className="font-semibold">{nextBillDate}</span>
                <span className="mx-1 text-text-faint">·</span>
                <span className="font-mono">{fmtUsd(amount)}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-text-dim">{paymentMethod}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 grid h-5 w-5 place-items-center rounded-sm text-text-faint hover:bg-surface hover:text-text"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden>
                <path
                  d="M3 3 L13 13 M13 3 L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export function AgBilC2Ledger({
  data,
}: { data?: AgencyBillingData } = {}): JSX.Element {
  const d = data ?? MOCK;
  return (
    <div className="space-y-6 px-1 py-1">
      <PageHeader agency={d.agency} invoices={d.invoices} subs={d.subClientBilling} />

      <TopStrip summary={d.summary} buckets={d.spendBuckets} />

      <div className="rounded-lg border border-border-muted bg-bg p-4">
        <Carousel subs={d.subClientBilling} invoices={d.invoices} />
      </div>

      <InvoiceLedger invoices={d.invoices} subs={d.subClientBilling} />

      <NextBillChip
        nextBillDate={d.agency.nextBillDate}
        amount={d.summary.nextChargeUsd}
        paymentMethod={d.agency.paymentMethodLabel}
      />
    </div>
  );
}

export default AgBilC2Ledger;
