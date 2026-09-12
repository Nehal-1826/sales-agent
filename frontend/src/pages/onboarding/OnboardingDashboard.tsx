import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useCurrency } from '@/lib/currency';
import { usePublicPlans } from '@/features/plans/publicPlans';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/AppToast';
import { clearOnboardingState } from '@/lib/onboardingState';
import { useCreateMailbox, useDnsCheck, type DnsCheckResponse } from '@/features/mailboxes/useCreateMailbox';
import { useProbeCredentials, useMailboxes, useDetectProvider } from '@/features/mailboxes/api';
import { useUpdateWorkspaceProfile } from '@/features/settings/api';
import { TutorialPanel } from './TutorialPanels';
import '@/pages/landing/hero-theme.css';
import './onboarding-dashboard.css';

interface PlanRow {
  id: string;
  name: string;
  /** Per-mailbox daily cap (from PlanCreate.daily_email_cap on the server).
   *  Drives the onboarding volume picker — Starter caps at 50, Pro 100,
   *  Agency 200, and anything an admin changes via /admin/plans flows
   *  through here automatically. */
  daily_email_cap?: number;
  max_mailboxes?: number;
}

/* ----- Plan options — FALLBACK + marketing overlay only.
        Live price/features come from /api/plans (admin Plans page) via
        usePublicPlans; this array is the name/slug-keyed overlay (blurb /
        highlight) and the fallback shown only when the API is unreachable.
        Prices are INR/month (the stored + charged base). ----- */
type PlanOption = {
  id: string; // plan slug — resolved to a DB UUID via resolvePlanId()
  name: string;
  price: number; // INR
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 1500,
    blurb: 'Solo founders dipping into outbound.',
    features: ['1 mailbox', '30 sends / day', 'Domain records (DNS) check + AI content', 'Weekly digest reports'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 5000,
    blurb: 'Teams running cold outreach at scale.',
    features: ['10 mailboxes · 50 sends / day each', 'Spam recovery + helper health-check', 'Webhook + Slack alerts', '90-day history · 10 seats'],
    highlight: true,
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 8000,
    blurb: 'Inbox-delivery nerds + power users.',
    features: ['Everything in Pro, plus:', '15 mailboxes · 75 sends / day', 'Postmaster + SNDS ingest', 'Inbox tester (30 seeds)'],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 15000,
    blurb: 'Agencies reselling to many clients.',
    features: ['Everything in Pro Plus, plus:', 'Unlimited mailboxes + sub-clients', 'White-label + custom domain', 'Dedicated helper group'],
  },
];

/** Yearly = pay 10 months, get 12 = 16.7% off ≈ "2 months free". */
const YEARLY_DISCOUNT = 10 / 12;

type TaskState = 'done' | 'active' | 'locked';

interface Task {
  id: string;
  title: string;
  hint: string;
  state: TaskState;
  /** Where the "Start" button goes for the active task. */
  href: string;
}

/**
 * O1 · Checklist Dashboard — the post-signup landing.
 *
 * Reads `user.onboarding_status` + `user.plan` from the auth store to derive
 * which step is done / active / locked. Auto-redirects to /app once status
 * lands on 'active'.
 */
const PENDING_PLAN_KEY = 'warmpulse.pendingPlan';
const PENDING_PAYMENT_KEY = 'warmpulse.pendingPayment';
const PENDING_VOLUME_KEY = 'warmpulse.pendingVolume';
const PENDING_PROVIDER_KEY = 'warmpulse.pendingProvider';
/** Set when the user explicitly leaves the DNS panel via "Continue to summary".
 *  Without this gate, a backend that flips onboarding_status straight from
 *  plan_selected → active on mailbox-create would skip the DNS + summary
 *  stages entirely. */
const PENDING_DNS_ACK_KEY = 'warmpulse.pendingDnsAck';
/** Set when the user has viewed the tutorial. */
const PENDING_TUTORIAL_ACK_KEY = 'warmpulse.pendingTutorialAck';
/** User preference for Auto CRM. */
const PENDING_AUTO_CRM_KEY = 'warmpulse.pendingAutoCrm';
/** Set when the user picks a NEW provider after already having a mailbox
 *  (e.g. clicked Switch provider / Change provider from the task list).
 *  While set, `activeStage` treats `mailboxCreated` as false so we land on
 *  the credentials form instead of skipping past it to DNS. Cleared on
 *  successful mailbox-create. */
const PENDING_NEW_MAILBOX_KEY = 'warmpulse.pendingNewMailbox';

type Stage = 'plan' | 'checkout' | 'volume' | 'provider' | 'credentials' | 'dns' | 'tutorial' | 'start';

const VOLUME_OPTIONS = [
  { value: 5, name: 'Just starting', desc: 'Brand new domain, no warmup history' },
  { value: 10, name: 'Cautious build-up', desc: 'Low-volume outreach' },
  { value: 20, name: 'Standard', desc: 'Typical sales / founder outreach', recommended: true },
  { value: 50, name: 'Aggressive', desc: 'Established sender, ready to push' },
  { value: 100, name: 'High volume', desc: 'Mature domain at scale' },
];

const PROVIDER_OPTIONS = [
  { id: 'gmail', name: 'Gmail / Workspace', sub: 'App password · SMTP/IMAP', tag: 'SMTP', color: '#ea4335', recommended: true },
  { id: 'outlook', name: 'Outlook / Office 365', sub: 'SMTP / IMAP w/ app password', tag: 'SMTP', color: '#F26522' },
  { id: 'yahoo', name: 'Yahoo Mail', sub: 'SMTP / IMAP w/ app password', tag: 'SMTP', color: '#F26522' },
  { id: 'zoho', name: 'Zoho Mail', sub: 'SMTP / IMAP w/ app password', tag: 'SMTP', color: '#fab43e' },
  { id: 'smtp', name: 'Generic SMTP / IMAP', sub: 'Fastmail, self-hosted, …', tag: 'SMTP', color: 'var(--wp-text-dim)' },
];

/* ----- Summary row used by the final 'start' panel ----- */
function SummaryRow({
  icon,
  label,
  value,
  valueStatus,
  onEdit,
  editLabel = 'Edit',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** Tints the value pill — 'ok' = green, 'warn' = amber. Omit for default. */
  valueStatus?: 'ok' | 'warn';
  /** Omit when the field is not editable (e.g. Account). */
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="onb-summary__row">
      <span className="onb-summary__icon">{icon}</span>
      <div className="onb-summary__body">
        <dt className="onb-summary__label">{label}</dt>
        <dd
          className={`onb-summary__value ${
            valueStatus === 'ok'
              ? 'onb-summary__value--ok'
              : valueStatus === 'warn'
                ? 'onb-summary__value--warn'
                : ''
          }`}
        >
          {value}
        </dd>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="onb-summary__edit">
          {editLabel}
        </button>
      )}
    </div>
  );
}

export function OnboardingDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { format } = useCurrency();

  // Locally-cached pending state (set inline as user progresses).
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [pendingPlan, setPendingPlan] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.sessionStorage.getItem(PENDING_PLAN_KEY),
  );
  const [pendingPayment, setPendingPayment] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.sessionStorage.getItem(PENDING_PAYMENT_KEY) === '1',
  );
  const [pendingVolume, setPendingVolume] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = window.sessionStorage.getItem(PENDING_VOLUME_KEY);
    return v ? Number(v) : null;
  });
  const [pendingProvider, setPendingProvider] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.sessionStorage.getItem(PENDING_PROVIDER_KEY),
  );
  const [dnsAcknowledged, setDnsAcknowledged] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.sessionStorage.getItem(PENDING_DNS_ACK_KEY) === '1',
  );
  const [tutorialAcknowledged, setTutorialAcknowledged] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.sessionStorage.getItem(PENDING_TUTORIAL_ACK_KEY) === '1',
  );
  const [autoCrmEnabled, setAutoCrmEnabled] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.sessionStorage.getItem(PENDING_AUTO_CRM_KEY) !== '0',
  );
  /** Live-updated by the DnsPanel via the `onDnsFailed` callback. When true,
   *  the final 'start' summary panel renders a hard-fail banner directing
   *  the user back to Step 6. Primary block lives inside the DNS panel
   *  itself (Continue hidden), this is belt-and-suspenders. */
  const [dnsFailed, setDnsFailed] = useState<boolean>(false);
  const [newMailboxFlow, setNewMailboxFlow] = useState<boolean>(() =>
    typeof window === 'undefined'
      ? false
      : window.sessionStorage.getItem(PENDING_NEW_MAILBOX_KEY) === '1',
  );
  const [paymentTab, setPaymentTab] = useState<'card' | 'upi'>('card');
  const [customVolume, setCustomVolume] = useState<string>('');
  const [paying, setPaying] = useState(false);

  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    clearOnboardingState();
    logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  // Existing mailboxes — drives the "you already have one" auto-advance.
  // If the user has any mailbox in their workspace (e.g. from a trial-mode
  // create earlier in onboarding, or from a previous completed run), we
  // skip the credentials step entirely and treat their existing mailbox
  // as the onboarding mailbox. Prevents the "Plan allows 1 mailbox" cap
  // error that triggers when they accidentally try to connect a second.
  const mailboxesQuery = useMailboxes();
  const existingMailboxCount = mailboxesQuery.data?.items?.length ?? 0;
  const hasExistingMailbox = existingMailboxCount > 0;

  // Legacy OAuth-connected mailboxes (connected before OAuth connect was
  // removed) authenticate through the provider's own infrastructure, so the
  // client-facing SPF/DKIM/DMARC step doesn't apply — skip the
  // DNS-verification stage for them entirely.
  const connectedViaOauth = mailboxesQuery.data?.items?.some((m) => m.is_oauth) ?? false;

  // Automated (Sent-folder import) CRM is a Pro Plus / Agency capability. On
  // lower plans the toggle is manual-only and the backend rejects enabling it.
  const planSupportsAutoCrm = pendingPlan === 'pro_plus' || pendingPlan === 'agency';

  // Fetch plans so we can map our local slugs (starter/pro/agency) to DB UUIDs.
  const plansQuery = useQuery<PlanRow[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await api.get<PlanRow[]>('/plans');
      return res.data;
    },
  });

  function resolvePlanId(slug: string | null): string | null {
    if (!slug || !plansQuery.data) return null;
    // Normalise both sides: lower-case, collapse underscores/hyphens/spaces.
    // Frontend slug is 'pro_plus' but the DB row is named 'Pro Plus' — without
    // this normalisation the equality check misses.
    const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
    const target = normalise(slug);
    const match = plansQuery.data.find((p) => normalise(p.name) === target);
    return match?.id ?? null;
  }

  // Price, features, mailbox limits, and which tiers show all come from the
  // admin Plans page via /api/plans (usePublicPlans, same source as the landing
  // hero — so onboarding and the home page never disagree). PLAN_OPTIONS is just
  // the slug-keyed marketing overlay (blurb / "most popular") + the fallback
  // shown only when the API is unreachable.
  const { data: apiPlans } = usePublicPlans();
  const planOverlayBySlug = new Map(PLAN_OPTIONS.map((p) => [p.id, p]));
  const visiblePlanOptions: PlanOption[] =
    apiPlans && apiPlans.length > 0
      ? apiPlans.map((p) => {
          const o = planOverlayBySlug.get(p.slug);
          return {
            id: o?.id ?? p.slug,
            name: p.name,
            price: p.priceMonthly,
            blurb: o?.blurb ?? '',
            features: p.features.length > 0 ? p.features : o?.features ?? [],
            highlight: o?.highlight ?? p.slug === 'pro',
          };
        })
      : PLAN_OPTIONS;

  // If they're already past onboarding, bounce to the app — BUT only if they
  // didn't just complete a mailbox in this same session. The backend flips
  // onboarding_status to 'active' on mailbox-create, and without this guard
  // the user gets yanked off the dashboard before they ever see the DNS
  // verification panel or the "You're all set" summary.
  //
  // We detect "in-flow" by checking the sessionStorage breadcrumbs we set as
  // the user progressed (pendingPlan / payment / volume / provider). If ANY
  // are present, the user is mid-flow on this device — let them finish the
  // checklist visibly. Only a fresh visit (no breadcrumbs) auto-redirects.
  useEffect(() => {
    if (user?.onboarding_status !== 'active') return;
    if (typeof window === 'undefined') return;
    const inFlow =
      window.sessionStorage.getItem(PENDING_PLAN_KEY) ||
      window.sessionStorage.getItem(PENDING_PAYMENT_KEY) ||
      window.sessionStorage.getItem(PENDING_VOLUME_KEY) ||
      window.sessionStorage.getItem(PENDING_PROVIDER_KEY);
    // If user is past onboarding (`status === 'active'`) and has no
    // in-session breadcrumbs (`!inFlow`), they're a returning user — bounce
    // them to the app. Previously this also required `acked === true` (a
    // sessionStorage flag set only when they explicitly clicked through the
    // DNS panel in the same tab), which trapped any user landing on
    // /onboarding from a different device/session/tab. Drop the `acked`
    // gate — `!inFlow` alone is sufficient to detect "returning user".
    if (!inFlow) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [user?.onboarding_status, navigate]);

  const planName = user?.plan ?? pendingPlan;

  // Lookup the user's plan row from the server. The daily_email_cap on
  // that row is the source of truth for what volume options to expose at
  // onboarding (and matches whatever the admin currently has configured
  // via /admin/plans). Falls back to a generous 200 if the lookup fails
  // (e.g. plans query still loading) so we don't accidentally hide every
  // option during the network round-trip.
  const activePlanRow = (() => {
    if (!planName || !plansQuery.data) return null;
    const target = planName.toLowerCase();
    return (
      plansQuery.data.find((p) => p.name.toLowerCase() === target) ?? null
    );
  })();
  const dailyCap = activePlanRow?.daily_email_cap ?? 200;
  // Volume options gated to whatever the chosen plan allows. The "100/day"
  // option vanishes for Starter (cap 50), the custom input's max attribute
  // tightens accordingly, and recommended-tier highlights still apply.
  const allowedVolumeOptions = VOLUME_OPTIONS.filter((opt) => opt.value <= dailyCap);

  // Derive the active stage from the chain of pending breadcrumbs + the
  // backend's onboarding_status.
  //
  // The DNS panel and the final summary are *always* surfaced after mailbox
  // creation, regardless of what the backend says. This matters because the
  // backend currently flips onboarding_status from plan_selected → active
  // directly on mailbox-create (no intermediate mailbox_pending) — without
  // the explicit `dnsAcknowledged` gate, the user would never see the DNS
  // check OR the summary, just be yanked straight into /app/dashboard.
  const activeStage: Stage = (() => {
    if (!pendingPlan) return 'plan';
    if (!pendingVolume) return 'volume';
    if (!pendingProvider) return 'provider';
    // `newMailboxFlow` overrides the backend's onboarding_status. Set when
    // the user picks a new provider after already having a mailbox — without
    // it, they'd skip past 'credentials' straight to 'dns' (since the
    // backend still reports 'active' from the previous mailbox).
    //
    // EXCEPTION: if the workspace already has at least one mailbox, we
    // *always* treat credentials as done — even when `newMailboxFlow` is
    // true. The user already connected a mailbox successfully (possibly
    // earlier in this same onboarding run via the no-plan trial allowance);
    // re-running credentials would hit the plan cap and frustrate them.
    // They can always add more mailboxes later from /app/mailboxes.
    const mailboxCreated =
      hasExistingMailbox ||
      (!newMailboxFlow &&
        (user?.onboarding_status === 'mailbox_pending' ||
          user?.onboarding_status === 'active'));
    if (!mailboxCreated) return 'credentials';
    // OAuth mailboxes skip DNS verification — provider handles auth. For all
    // other (SMTP app-password) connections the DNS step still applies.
    if (!dnsAcknowledged && !connectedViaOauth) return 'dns';
    if (!tutorialAcknowledged) return 'tutorial';
    // Checkout deferred to the end so the user can connect + DNS-verify
    // their mailbox before paying. Trial allowance on the backend lets the
    // mailbox-create through even without a plan_id.
    if (!pendingPayment) return 'checkout';
    return 'start';
  })();

  const handleAckDns = () => {
    window.sessionStorage.setItem(PENDING_DNS_ACK_KEY, '1');
    setDnsAcknowledged(true);
  };

  const handleAckTutorial = () => {
    window.sessionStorage.setItem(PENDING_TUTORIAL_ACK_KEY, '1');
    setTutorialAcknowledged(true);
  };

  const handleToggleAutoCrm = (enabled: boolean) => {
    window.sessionStorage.setItem(PENDING_AUTO_CRM_KEY, enabled ? '1' : '0');
    setAutoCrmEnabled(enabled);
  };

  const updateProfile = useUpdateWorkspaceProfile();
  const [finishing, setFinishing] = useState(false);

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await updateProfile.mutateAsync({
        // Automated CRM is a Pro Plus / Agency capability. Sending
        // auto_crm_enabled:true on a lower plan is rejected by the backend
        // (403) and would block onboarding completion — so only enable it when
        // the selected plan actually supports it.
        auto_crm_enabled: autoCrmEnabled && planSupportsAutoCrm,
      });
      handleClearPlan(); // clear session breadcrumbs
      navigate('/app/dashboard');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setFinishing(false);
    }
  };

  const handlePickPlan = (id: PlanOption['id']) => {
    window.sessionStorage.setItem(PENDING_PLAN_KEY, id);
    setPendingPlan(id);
  };
  const handleClearPlan = () => {
    [
      PENDING_PLAN_KEY,
      PENDING_PAYMENT_KEY,
      PENDING_VOLUME_KEY,
      PENDING_PROVIDER_KEY,
      PENDING_DNS_ACK_KEY,
      PENDING_TUTORIAL_ACK_KEY,
      PENDING_AUTO_CRM_KEY,
      PENDING_NEW_MAILBOX_KEY,
    ].forEach((k) => window.sessionStorage.removeItem(k));
    setPendingPlan(null);
    setPendingPayment(false);
    setPendingVolume(null);
    setPendingProvider(null);
    setDnsAcknowledged(false);
    setTutorialAcknowledged(false);
    setAutoCrmEnabled(true);
    setNewMailboxFlow(false);
  };
  const handleCompletePayment = async () => {
    // eslint-disable-next-line no-console
    console.log('[onboarding/payment] click', { pendingPlan, plansLoaded: !!plansQuery.data });
    const planId = resolvePlanId(pendingPlan);
    if (!planId) {
      toast.error(
        `Plan lookup failed (pendingPlan=${pendingPlan ?? 'null'}, plans=${plansQuery.data?.length ?? 0}). Refresh and try again.`,
      );
      return;
    }
    setPaying(true);
    try {
      let freshUser: typeof user | null = null;
      if (paymentTab === 'card') {
        const res = await api.post('/payments/dummy', {
          plan_id: planId,
          card_number: '4242424242424242',
          cvc: '123',
          expiry_mmyy: '12/30',
          cardholder_name: user?.email?.split('@')[0] || 'Test User',
          country: 'IN',
        });
        freshUser = res.data?.user ?? null;
      } else {
        const res = await api.post('/payments/upi', {
          plan_id: planId,
          vpa: 'test@oksbi',
        });
        freshUser = res.data?.user ?? null;
      }
      if (freshUser) {
        // Two writes, not one — Zustand owns the persisted user, and the
        // TanStack cache backs `useMe()` which `usePlan()` reads. Until we
        // wrote both, the dashboard could land on the wrong tier (Pro
        // instead of Pro Plus) because `usePlan` saw a stale cache while
        // the freshly-paid user was already in Zustand.
        setUser(freshUser);
        queryClient.setQueryData(['auth', 'me'], freshUser);
      }
      // QA / dev-mode plan overrides are workspace-scoped to the developer's
      // browser; they must NOT outlive a real payment. A leftover
      // `warmpulse.planOverride='pro'` would otherwise pin a freshly-
      // upgraded Pro Plus user back to the Pro layout. Clear it unless the
      // user is a super_admin (admins legitimately preview tiers in prod).
      try {
        if (typeof window !== 'undefined' && freshUser?.role !== 'super_admin') {
          window.localStorage.removeItem('warmpulse.planOverride');
        }
      } catch {
        /* localStorage may throw in private mode — best-effort */
      }
      window.sessionStorage.setItem(PENDING_PAYMENT_KEY, '1');
      setPendingPayment(true);
      // Still invalidate so any other consumer (e.g. a Settings page open
      // in another tab) picks up the change. The setQueryData above is the
      // synchronous half that lets the current render flip instantly.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Plan activated — proceed to mailbox setup.');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[onboarding/payment] failed', err);
      // Show as much detail as we can pry out of the error so the user
      // sees *why* the dummy gateway rejected the call (was auth, was
      // 422 validation, etc.). The dummy gateway should never legitimately
      // fail — if it does, it's almost always a session/auth problem.
      type AxiosLike = {
        response?: { status?: number; data?: { detail?: unknown } };
        message?: string;
      };
      const axiosErr = err as AxiosLike;
      const status = axiosErr.response?.status;
      const rawDetail = axiosErr.response?.data?.detail;
      const detail =
        typeof rawDetail === 'string'
          ? rawDetail
          : Array.isArray(rawDetail)
            ? JSON.stringify(rawDetail)
            : axiosErr.message ?? 'Payment failed';
      toast.error(`${status ? `[${status}] ` : ''}${detail}`);
    } finally {
      setPaying(false);
    }
  };
  const handleClearPayment = () => {
    window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    setPendingPayment(false);
  };
  const handlePickVolume = (v: number) => {
    window.sessionStorage.setItem(PENDING_VOLUME_KEY, String(v));
    setPendingVolume(v);
  };
  const handleClearVolume = () => {
    window.sessionStorage.removeItem(PENDING_VOLUME_KEY);
    setPendingVolume(null);
  };
  const handlePickProvider = (id: string) => {
    window.sessionStorage.setItem(PENDING_PROVIDER_KEY, id);
    setPendingProvider(id);
    // Picking a new provider implies the user wants to re-connect a mailbox.
    // Reset DNS ack so the new mailbox starts with a fresh verification step.
    window.sessionStorage.removeItem(PENDING_DNS_ACK_KEY);
    setDnsAcknowledged(false);
    // If the backend already considers them done (active / mailbox_pending),
    // we need this flag so activeStage stays on 'credentials' instead of
    // skipping ahead to 'dns'. Cleared on successful mailbox-create below.
    window.sessionStorage.setItem(PENDING_NEW_MAILBOX_KEY, '1');
    setNewMailboxFlow(true);
  };
  const handleClearProvider = () => {
    window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
    setPendingProvider(null);
    window.sessionStorage.removeItem(PENDING_DNS_ACK_KEY);
    setDnsAcknowledged(false);
    // Same reason as in handlePickProvider — once the user starts changing
    // their provider, we must override the backend's "already-active"
    // status until they pick + connect again.
    window.sessionStorage.setItem(PENDING_NEW_MAILBOX_KEY, '1');
    setNewMailboxFlow(true);
  };
  /** Used by the "Re-check" button on the Verify DNS task row, and called
   *  from `finish()` in CredentialsPanel after a fresh mailbox is created
   *  so a stale ack from a previous flow doesn't auto-skip DNS. */
  const handleResetDnsAck = () => {
    window.sessionStorage.removeItem(PENDING_DNS_ACK_KEY);
    setDnsAcknowledged(false);
  };
  /** Called after a successful mailbox-create from CredentialsPanel.finish().
   *  Wipes both the DNS ack (so user lands on 'dns' next) and the new-mailbox
   *  flow flag (so the backend's onboarding_status takes effect again). */
  const handleMailboxCreated = () => {
    window.sessionStorage.removeItem(PENDING_DNS_ACK_KEY);
    setDnsAcknowledged(false);
    window.sessionStorage.removeItem(PENDING_NEW_MAILBOX_KEY);
    setNewMailboxFlow(false);
  };


  function stateFor(target: Stage): TaskState {
    const order: Stage[] = [
      'plan',
      'volume',
      'provider',
      'credentials',
      'dns',
      'checkout',
      'tutorial',
      'start',
    ];
    const ai = order.indexOf(activeStage);
    const ti = order.indexOf(target);
    if (ti < ai) return 'done';
    if (ti === ai) return 'active';
    return 'locked';
  }

  const tasks: Task[] = [
    {
      id: 'account',
      title: 'Create account',
      hint: user?.email ?? 'Email verified',
      state: 'done',
      href: '#',
    },
    {
      id: 'plan',
      title: 'Pick a plan',
      hint:
        planName != null
          ? `${planName.charAt(0).toUpperCase() + planName.slice(1)} plan selected`
          : 'Starter, Pro, or Agency',
      state: stateFor('plan'),
      href: '#',
    },
    {
      id: 'volume',
      title: 'Set daily volume target',
      hint: pendingVolume ? `${pendingVolume} emails / day` : 'Daily target after 28 days',
      state: stateFor('volume'),
      href: '#',
    },
    {
      id: 'provider',
      title: 'Pick a provider',
      hint: pendingProvider ? `${pendingProvider} selected` : 'Gmail, Outlook, Yahoo, or SMTP',
      state: stateFor('provider'),
      href: '#',
    },
    // DNS verification only applies to SMTP app-password mailboxes. OAuth
    // (Gmail / Outlook) connections authenticate through the provider, so the
    // row is omitted entirely for them.
    ...(connectedViaOauth
      ? []
      : [
          {
            id: 'dns',
            title: 'Verify domain records (DNS)',
            hint: 'SPF · DKIM · DMARC alignment',
            state: stateFor('dns'),
            // '#' suppresses the "Start →" link on the task row — the DNS panel
            // already renders inline on the right side when this task is active.
            href: '#',
          } as Task,
        ]),
    {
      id: 'checkout',
      title: 'Complete checkout',
      hint: pendingPayment ? 'Payment recorded · dummy gateway' : 'Card or UPI · mock billing',
      state: stateFor('checkout'),
      href: '#',
    },
    {
      id: 'tutorial',
      title: 'WarmPulse Academy',
      hint: 'Platform tutorial & CRM choice',
      state: stateFor('tutorial'),
      href: '#',
    },
    {
      id: 'start',
      title: 'Start your first warmup',
      hint: 'Day 1 limit: 5 emails · builds up over 30 days',
      state: stateFor('start'),
      // '#' for the same reason — the "Open workspace" CTA lives in the
      // inline final panel, not on the task row.
      href: '#',
    },
  ];

  const doneCount = tasks.filter((t) => t.state === 'done').length;
  const total = tasks.length;
  const progressPct = Math.round((doneCount / total) * 100);

  return (
    <div className="onb-shell">
      <div className="onb-shell__atmosphere" aria-hidden>
        <div className="onb-shell__aurora-1" />
        <div className="onb-shell__aurora-2" />
        <div className="onb-shell__grid" />
      </div>

      {/* Top bar */}
      <header className="onb-topbar">
        <div className="onb-topbar__brand">
          <span className="onb-topbar__logo">
            <svg viewBox="0 0 80 80" fill="none">
              <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#onb-logo-grad)" />
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
              <g transform="translate(54 22)">
                <path
                  d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z"
                  fill="white"
                />
              </g>
              <defs>
                <linearGradient id="onb-logo-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#F26522" />
                  <stop offset="1" stopColor="#FF8A4B" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="onb-topbar__brand-word">WarmPulse</span>
          <span className="onb-topbar__crumb">· Onboarding</span>
        </div>
        <div className="onb-topbar__user">
          <span className="onb-topbar__avatar">
            {(user?.email ?? 'U').slice(0, 2).toUpperCase()}
          </span>
          <span className="onb-topbar__email">{user?.email ?? 'you@example.com'}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="onb-topbar__logout"
            aria-label="Log out"
          >
            <LogOut size={13} strokeWidth={2} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      {/* Main body */}
      <main className="onb-body pb-16">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="onb-welcome"
        >
          <span className="onb-welcome__badge">
            <Sparkles size={11} strokeWidth={2} />
            <span>Setup · ~2 minutes</span>
          </span>
          <h1 className="onb-welcome__h">
            Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}.{' '}
            <span className="wp-headline-grad">Let's set up your workspace.</span>
          </h1>
          <p className="onb-welcome__sub">
            Five quick steps and your first mailbox will start warming. The peer network does the
            heavy lifting from there.
          </p>
          <div className="onb-progress">
            <div className="onb-progress__bar">
              <motion.div
                className="onb-progress__fill"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="onb-progress__meta">
              <span>Setup progress</span>
              <strong>
                {doneCount} of {total} complete · {progressPct}%
              </strong>
            </div>
          </div>
        </motion.div>

        {/* Task grid */}
        <div className="onb-grid">
          {/* Left: task list */}
          <div className="onb-tasks">
            {tasks.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
                className={`onb-task onb-task--${task.state}`}
              >
                <span className={`onb-task__bullet onb-task__bullet--${task.state}`}>
                  {task.state === 'done' && <CheckCircle2 size={12} strokeWidth={2.8} />}
                </span>
                <div className="onb-task__body">
                  <div className="onb-task__title">{task.title}</div>
                  <div className="onb-task__hint">{task.hint}</div>
                </div>
                {task.state === 'active' && task.href !== '#' && (
                  <Link to={task.href} className="onb-task__cta">
                    Start
                    <ArrowRight size={12} strokeWidth={2.4} />
                  </Link>
                )}
                {task.state === 'done' && task.id === 'plan' && (
                  <button type="button" onClick={handleClearPlan} className="onb-task__change">
                    Change
                  </button>
                )}
                {task.state === 'done' && task.id === 'checkout' && (
                  <button type="button" onClick={handleClearPayment} className="onb-task__change">
                    Change
                  </button>
                )}
                {task.state === 'done' && task.id === 'volume' && (
                  <button type="button" onClick={handleClearVolume} className="onb-task__change">
                    Change
                  </button>
                )}
                {task.state === 'done' && task.id === 'provider' && (
                  <button type="button" onClick={handleClearProvider} className="onb-task__change">
                    Change
                  </button>
                )}
                {task.state === 'done' && task.id === 'dns' && (
                  <button type="button" onClick={handleResetDnsAck} className="onb-task__change">
                    Re-check
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {/* Right: contextual panel for the active task */}
          <aside className="onb-side">
            {activeStage === 'plan' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="onb-side__card onb-side__card--plans"
              >
                <div className="onb-side__panel-head">
                  <span className="onb-side__panel-eyebrow">Step 2 · Pick a plan</span>
                  <h4 className="onb-side__title">Choose a plan to continue</h4>
                </div>

                {/* Monthly / Yearly toggle */}
                <div
                  role="tablist"
                  aria-label="Billing cycle"
                  style={{
                    display: 'inline-flex',
                    alignSelf: 'center',
                    gap: 4,
                    padding: 4,
                    margin: '4px auto 14px',
                    borderRadius: 999,
                    background: 'var(--wp-surface-2)',
                    border: '1px solid var(--wp-border-strong)',
                  }}
                >
                  {(['monthly', 'yearly'] as const).map((c) => {
                    const active = billingCycle === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setBillingCycle(c)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 999,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          background: active
                            ? 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))'
                            : 'transparent',
                          color: active ? '#fff' : 'var(--wp-text-dim)',
                          boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : undefined,
                        }}
                      >
                        {c === 'monthly' ? 'Monthly' : 'Yearly'}
                        {c === 'yearly' && (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: 999,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              background: active
                                ? 'rgba(255,255,255,0.22)'
                                : 'color-mix(in srgb, var(--wp-success) 20%, transparent)',
                              color: active ? '#fff' : 'var(--wp-success)',
                            }}
                          >
                            −17%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="onb-plans">
                  {visiblePlanOptions.map((plan, i) => {
                    const displayPrice =
                      billingCycle === 'yearly'
                        ? plan.price * YEARLY_DISCOUNT
                        : plan.price;
                    const yearlyTotal = plan.price * 12 * YEARLY_DISCOUNT;
                    return (
                    <motion.button
                      key={plan.id}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
                      onClick={() => handlePickPlan(plan.id)}
                      className={`onb-plan ${plan.highlight ? 'onb-plan--highlight' : ''}`}
                    >
                      {plan.highlight && <span className="onb-plan__badge">Most popular</span>}
                      <div className="onb-plan__head">
                        <span className="onb-plan__name">{plan.name}</span>
                        <span className="onb-plan__price">
                          {format(displayPrice)}
                          <span className="onb-plan__per">/mo</span>
                        </span>
                      </div>
                      {billingCycle === 'yearly' && plan.price > 0 && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 2,
                            fontFamily: 'monospace',
                            fontSize: 10.5,
                            color: 'var(--wp-text-faint)',
                            letterSpacing: 0.2,
                          }}
                        >
                          Billed yearly · {format(yearlyTotal)}/yr
                        </span>
                      )}
                      <p className="onb-plan__blurb">{plan.blurb}</p>
                      <ul className="onb-plan__features">
                        {plan.features.map((f) => (
                          <li key={f}>
                            <Check size={11} strokeWidth={2.6} />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <span className="onb-plan__cta">
                        Choose {plan.name}
                        <ArrowRight size={12} strokeWidth={2.4} />
                      </span>
                    </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeStage === 'checkout' && (
              <motion.div
                key="checkout"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="onb-side__card"
              >
                <div className="onb-side__panel-head">
                  <span className="onb-side__panel-eyebrow">Step 7 · Checkout</span>
                  <h4 className="onb-side__title">
                    Pay for{' '}
                    {pendingPlan
                      ? pendingPlan.charAt(0).toUpperCase() + pendingPlan.slice(1)
                      : 'your plan'}
                  </h4>
                </div>

                <div className="onb-checkout__notice">
                  <ShieldCheck size={12} strokeWidth={2} />
                  <span>No real charge — dummy gateway for MVP.</span>
                </div>

                <div className="onb-checkout__tabs">
                  <button
                    type="button"
                    className={`onb-checkout__tab ${paymentTab === 'card' ? 'is-active' : ''}`}
                    onClick={() => setPaymentTab('card')}
                  >
                    <CreditCard size={12} strokeWidth={2} />
                    Card
                  </button>
                  <button
                    type="button"
                    className={`onb-checkout__tab ${paymentTab === 'upi' ? 'is-active' : ''}`}
                    onClick={() => setPaymentTab('upi')}
                  >
                    <Smartphone size={12} strokeWidth={2} />
                    UPI
                  </button>
                </div>

                {paymentTab === 'card' ? (
                  <div className="onb-checkout__form">
                    <label className="onb-checkout__field">
                      <span className="onb-checkout__label">Card number</span>
                      <input type="text" placeholder="4242 4242 4242 4242" readOnly />
                    </label>
                    <div className="onb-checkout__row">
                      <label className="onb-checkout__field">
                        <span className="onb-checkout__label">Expiry</span>
                        <input type="text" placeholder="MM/YY" readOnly />
                      </label>
                      <label className="onb-checkout__field">
                        <span className="onb-checkout__label">CVC</span>
                        <input type="text" placeholder="123" readOnly />
                      </label>
                    </div>
                    <label className="onb-checkout__field">
                      <span className="onb-checkout__label">Cardholder</span>
                      <input type="text" placeholder="Jane Doe" readOnly />
                    </label>
                  </div>
                ) : (
                  <div className="onb-checkout__form">
                    <label className="onb-checkout__field">
                      <span className="onb-checkout__label">UPI ID</span>
                      <input type="text" placeholder="you@oksbi" readOnly />
                    </label>
                    <p className="onb-checkout__hint">
                      We'll send a payment request to your UPI app. Approve to continue.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCompletePayment}
                  disabled={paying || !plansQuery.data}
                  className="onb-side__inline-cta"
                  style={paying ? { opacity: 0.7, pointerEvents: 'none' } : undefined}
                >
                  {paying ? 'Processing…' : 'Complete payment'}
                  {!paying && <ArrowRight size={12} strokeWidth={2.2} />}
                </button>
              </motion.div>
            )}

            {activeStage === 'volume' && (
              <motion.div
                key="volume"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="onb-side__card"
              >
                <div className="onb-side__panel-head">
                  <span className="onb-side__panel-eyebrow">Step 3 · Daily volume</span>
                  <h4 className="onb-side__title">Where should warmup land in 28 days?</h4>
                </div>
                <p className="onb-side__help-body">
                  WarmPulse will build up toward this target over 28 days. You can change it later
                  per mailbox.
                </p>

                <div className="onb-volume__grid">
                  {allowedVolumeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handlePickVolume(opt.value)}
                      className={`onb-volume__opt ${opt.recommended ? 'onb-volume__opt--rec' : ''}`}
                    >
                      <div className="onb-volume__v">
                        {opt.value}
                        <span>/day</span>
                      </div>
                      <div className="onb-volume__name">{opt.name}</div>
                      <div className="onb-volume__desc">{opt.desc}</div>
                    </button>
                  ))}
                  <div className="onb-volume__opt onb-volume__opt--custom">
                    <div className="onb-volume__name">Custom</div>
                    <input
                      type="number"
                      min={1}
                      max={dailyCap}
                      placeholder={`1 – ${dailyCap}`}
                      value={customVolume}
                      onChange={(e) => setCustomVolume(e.target.value)}
                      className="onb-volume__input"
                    />
                    <button
                      type="button"
                      disabled={
                        !customVolume ||
                        Number(customVolume) < 1 ||
                        Number(customVolume) > dailyCap
                      }
                      onClick={() => {
                        const n = Number(customVolume);
                        if (n >= 1 && n <= dailyCap) handlePickVolume(n);
                      }}
                      className="onb-volume__custom-cta"
                    >
                      Use
                      <ArrowRight size={11} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: 11,
                    color: 'var(--wp-text-faint, #71717a)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Your <strong style={{ color: 'var(--wp-text-dim, #a1a1aa)' }}>
                    {planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'current'}
                  </strong>{' '}
                  plan caps daily volume at <strong style={{ color: 'var(--wp-accent, #F26522)' }}>{dailyCap}/day per mailbox</strong>.
                  Upgrade later to lift the ceiling.
                </p>
              </motion.div>
            )}

            {activeStage === 'provider' && (
              <motion.div
                key="provider"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="onb-side__card"
              >
                <div className="onb-side__panel-head">
                  <span className="onb-side__panel-eyebrow">Step 4 · Provider</span>
                  <h4 className="onb-side__title">Pick where your mailbox lives</h4>
                </div>
                <p className="onb-side__help-body">
                  Connect any provider with an app password over SMTP/IMAP — the most
                  portable and reliable way to link a mailbox.
                </p>
                <div className="onb-providers">
                  {PROVIDER_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePickProvider(p.id)}
                      className="onb-provider"
                    >
                      <span
                        className="onb-provider__icon"
                        style={{
                          background: `color-mix(in srgb, ${p.color} 14%, transparent)`,
                          color: p.color,
                        }}
                      >
                        <Mail size={12} strokeWidth={2.2} />
                      </span>
                      <div className="onb-provider__body">
                        <div className="onb-provider__name">
                          {p.name}
                          {p.recommended && <span className="onb-provider__rec">Recommended</span>}
                        </div>
                        <div className="onb-provider__sub">
                          {p.sub} · <span className="onb-provider__tag">{p.tag}</span>
                        </div>
                      </div>
                      <ArrowRight
                        size={12}
                        strokeWidth={2}
                        style={{ color: 'var(--wp-text-faint)' }}
                      />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {activeStage === 'credentials' && (
              <CredentialsPanel
                provider={pendingProvider}
                dailyVolume={pendingVolume ?? 50}
                onMailboxCreated={handleMailboxCreated}
                onChangeProvider={handleClearProvider}
              />
            )}

            {activeStage === 'dns' && (
              <DnsPanel
                emailAddress={user?.email ?? null}
                provider={pendingProvider}
                onContinue={handleAckDns}
                onDnsFailed={setDnsFailed}
              />
            )}

            {activeStage === 'tutorial' && (
              <TutorialPanel 
                autoCrmEnabled={autoCrmEnabled}
                onToggleAutoCrm={handleToggleAutoCrm}
                onFinish={handleAckTutorial}
              />
            )}

            {activeStage === 'start' && (
              <motion.div
                key="next-step"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="onb-side__card onb-summary"
              >
                <div className="onb-side__panel-head">
                  <span className="onb-side__panel-eyebrow">Final · Review &amp; start</span>
                  <h4 className="onb-side__title">You're all set</h4>
                </div>
                {dnsFailed && (
                  <div className="onb-dns__fail-banner" role="alert">
                    <ShieldAlert size={14} strokeWidth={2.2} />
                    <div className="onb-dns__fail-banner-body">
                      <p className="onb-dns__fail-banner-title">
                        Domain records (DNS) still missing
                      </p>
                      <p className="onb-dns__fail-banner-sub">
                        Warmup cannot start until SPF, DKIM and DMARC are published.
                        Go back to Step 6 to fix.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetDnsAck}
                      className="onb-dns__fail-banner-cta"
                    >
                      Fix domain records (DNS)
                      <ArrowRight size={11} strokeWidth={2.4} />
                    </button>
                  </div>
                )}
                <p className="onb-side__help-body">
                  Here's everything we configured. Edit any field, or open the workspace to kick
                  off your first warmup cycle (Day 1 limited to 5 emails — builds up from there).
                </p>

                <dl className="onb-summary__list">
                  <SummaryRow
                    icon={<Mail size={12} strokeWidth={2.2} />}
                    label="Account"
                    value={user?.email ?? '—'}
                    // No edit — to change account they'd have to log out
                  />
                  <SummaryRow
                    icon={<Sparkles size={12} strokeWidth={2.2} />}
                    label="Plan"
                    value={
                      planName
                        ? planName.charAt(0).toUpperCase() + planName.slice(1)
                        : '—'
                    }
                    onEdit={handleClearPlan}
                  />
                  <SummaryRow
                    icon={<CreditCard size={12} strokeWidth={2.2} />}
                    label="Payment"
                    value={pendingPayment ? 'Recorded · dummy gateway' : 'Pending'}
                    onEdit={handleClearPayment}
                  />
                  <SummaryRow
                    icon={<ArrowRight size={12} strokeWidth={2.2} />}
                    label="Daily volume"
                    value={pendingVolume ? `${pendingVolume} emails / day` : '—'}
                    onEdit={handleClearVolume}
                  />
                  <SummaryRow
                    icon={<Mail size={12} strokeWidth={2.2} />}
                    label="Provider"
                    value={
                      pendingProvider
                        ? (PROVIDER_OPTIONS.find((p) => p.id === pendingProvider)?.name ??
                          pendingProvider)
                        : '—'
                    }
                    onEdit={handleClearProvider}
                  />
                  <SummaryRow
                    icon={<ShieldCheck size={12} strokeWidth={2.2} />}
                    label="Domain records (DNS)"
                    value={dnsAcknowledged ? 'Verified' : 'Skipped'}
                    valueStatus={dnsAcknowledged ? 'ok' : 'warn'}
                    onEdit={handleResetDnsAck}
                    editLabel="Re-check"
                  />
                  <SummaryRow
                    icon={<Zap size={12} strokeWidth={2.2} />}
                    label="Lead Automation"
                    value={autoCrmEnabled && planSupportsAutoCrm ? 'Automatic' : 'Manual'}
                    onEdit={() => setTutorialAcknowledged(false)}
                    editLabel="Change"
                  />
                </dl>

                <button 
                  onClick={handleFinish} 
                  disabled={dnsFailed || finishing}
                  className="onb-side__inline-cta"
                >
                  {finishing ? 'Finalizing...' : 'Open workspace'}
                  {!finishing && <ArrowRight size={13} strokeWidth={2.2} />}
                </button>
              </motion.div>
            )}

          </aside>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
          <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-text">Privacy</Link>
            <Link to="/terms" className="hover:text-text">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================================
   Inline credentials panel. Routes by provider (app-password only):
     - gmail / outlook / yahoo / zoho → AppPasswordCard (email + app pwd form)
     - smtp                            → SmtpConnectForm (host/port form)
============================================================================ */

interface ProviderHelp {
  label: string;
  steps: Array<{ text: string; url?: string; linkLabel?: string }>;
  footer?: string;
}

type HelpKey = 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'smtp';

/**
 * Provider-specific app-password help. Lifted from the legacy
 * `AppPasswordHelp` feature component but re-rendered inline with the
 * dashboard's own CSS tokens (--wp-*) so the violet/glass theme stays
 * consistent. Keys are typed as a literal union so TS knows every lookup
 * resolves to a concrete value (no `| undefined` after access).
 */
const PROVIDER_HELP: Record<HelpKey, ProviderHelp> = {
  gmail: {
    label: 'Gmail / Google Workspace',
    steps: [
      {
        text: 'Open your Google Account security page.',
        url: 'https://myaccount.google.com/security',
        linkLabel: 'myaccount.google.com/security',
      },
      { text: 'Enable 2-Step Verification if it is not already on (app passwords require it).' },
      {
        text: 'Open the App passwords page.',
        url: 'https://myaccount.google.com/apppasswords',
        linkLabel: 'myaccount.google.com/apppasswords',
      },
      { text: 'Create a new app password and name it "WarmPulse" (or anything memorable).' },
      { text: 'Copy the 16-character password Google shows you and paste it above.' },
    ],
    footer:
      'Google displays the password as four space-separated groups — paste either with or without spaces; WarmPulse normalizes both.',
  },
  outlook: {
    label: 'Outlook / Microsoft 365',
    steps: [
      {
        text: 'Sign in to your Microsoft account security page.',
        url: 'https://account.microsoft.com/security',
        linkLabel: 'account.microsoft.com/security',
      },
      { text: 'Open "Advanced security options".' },
      { text: 'Make sure two-step verification is enabled.' },
      {
        text: 'Scroll to "App passwords" and create a new one.',
        url: 'https://account.live.com/proofs/AppPassword',
        linkLabel: 'account.live.com/proofs/AppPassword',
      },
      { text: 'Copy the generated password and paste it above.' },
    ],
    footer:
      'Work / school Microsoft 365 tenants may have legacy SMTP AUTH disabled — if the probe fails, ask your admin to enable "Authenticated SMTP" for your account.',
  },
  yahoo: {
    label: 'Yahoo Mail',
    steps: [
      {
        text: 'Sign in to your Yahoo Account security page.',
        url: 'https://login.yahoo.com/account/security',
        linkLabel: 'login.yahoo.com/account/security',
      },
      { text: 'Turn on 2-Step Verification — Yahoo requires it for app passwords.' },
      { text: 'Click "Generate app password" and pick "Other app".' },
      { text: 'Name it "WarmPulse" and click Generate.' },
      { text: 'Copy the 16-character password Yahoo displays and paste it above.' },
    ],
  },
  zoho: {
    label: 'Zoho Mail',
    steps: [
      {
        text: 'Open the Zoho App Passwords screen.',
        url: 'https://accounts.zoho.com/home#security/app_passwords',
        linkLabel: 'accounts.zoho.com → Security → App Passwords',
      },
      { text: 'Click "Generate New Password" and name it WarmPulse.' },
      { text: 'Copy the password Zoho displays and paste it above.' },
    ],
    footer:
      'IMAP is off by default on most Zoho plans — if the probe fails, either enable it in mailadmin.zoho.com or tick "Outbound-only warmup" below to skip IMAP.',
  },
  smtp: {
    label: 'Generic SMTP / IMAP',
    steps: [
      { text: 'Find your provider\'s SMTP host and port (typical: STARTTLS on 587, implicit TLS on 465).' },
      { text: 'If your provider supports 2FA, generate an app-specific password — your normal password will be rejected once 2FA is enabled.' },
      { text: 'IMAP is optional but recommended: the inbound port is usually 993 on the same host (or sometimes imap.<your-host>).' },
    ],
    footer:
      'Hostinger / cPanel / iRedMail self-hosted: use the same host for SMTP and IMAP; ports 587 + 993; the mailbox\'s own login password works unless you specifically enabled 2FA.',
  },
};

function defaultHosts(provider: string | null) {
  switch (provider) {
    case 'gmail':
      return { smtp_host: 'smtp.gmail.com', smtp_port: 587, imap_host: 'imap.gmail.com', imap_port: 993 };
    case 'yahoo':
      return { smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, imap_host: 'imap.mail.yahoo.com', imap_port: 993 };
    case 'zoho':
      return { smtp_host: 'smtp.zoho.com', smtp_port: 587, imap_host: 'imap.zoho.com', imap_port: 993 };
    case 'outlook':
      return { smtp_host: 'smtp.office365.com', smtp_port: 587, imap_host: 'outlook.office365.com', imap_port: 993 };
    default:
      return { smtp_host: '', smtp_port: 587, imap_host: '', imap_port: 993 };
  }
}

/**
 * Inline help disclosure styled with --wp-* CSS vars. Same content as the
 * legacy AppPasswordHelp.tsx but rendered inside the dashboard's own design
 * tokens so the disclosure matches the violet/glass aesthetic.
 */
function ProviderHelpDisclosure({ provider }: { provider: string }) {
  const key: HelpKey = (provider in PROVIDER_HELP ? provider : 'smtp') as HelpKey;
  const help = PROVIDER_HELP[key];
  const [open, setOpen] = useState(false);
  return (
    <div className="onb-credentials__help">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="onb-credentials__help-toggle"
        aria-expanded={open}
      >
        <HelpCircle size={13} strokeWidth={2.2} />
        <span>How do I get an app password for {help.label}?</span>
        <span className="onb-credentials__help-state">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="onb-credentials__help-body">
          <ol className="onb-credentials__help-list">
            {help.steps.map((s, i) => (
              <li key={i}>
                <span>{s.text}</span>
                {s.url && (
                  <>
                    {' '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="onb-credentials__help-link"
                    >
                      {s.linkLabel ?? s.url}
                      <ExternalLink size={10} strokeWidth={2} />
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
          {help.footer && <p className="onb-credentials__help-footer">{help.footer}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * One-line helper links shown above the provider router inside
 * CredentialsPanel: quick domain purchase + Julex store integration.
 * Styled like the panel's existing help text.
 */
function DomainHelpLinks() {
  return (
    <p
      className="onb-credentials__hint"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: 10 }}
    >
      <a
        href="https://www.namecheap.com/domains/registration/"
        target="_blank"
        rel="noopener noreferrer"
        className="onb-credentials__help-link"
      >
        Need a domain? Buy one →
        <ExternalLink size={10} strokeWidth={2} />
      </a>
      <Link to="/app/integrations/julex" className="onb-credentials__help-link">
        Link your Julex store →
      </Link>
    </p>
  );
}

function CredentialsPanel({
  provider,
  dailyVolume,
  onMailboxCreated,
  onChangeProvider,
}: {
  provider: string | null;
  dailyVolume: number;
  /** Called after a successful mailbox-create. The parent uses this to
   *  reset the DNS ack flag so a stale ack from a previous flow doesn't
   *  auto-skip the user past the DNS verification step on this new
   *  mailbox. */
  onMailboxCreated: () => void;
  /** Clears the chosen provider and bounces activeStage back to 'provider'.
   *  Wired into a "Switch provider" link at the top of each sub-panel so
   *  the user can pivot without leaving the credentials view. */
  onChangeProvider: () => void;
}) {
  const navigate = useNavigate();
  const isAppPassword =
    provider === 'gmail' || provider === 'outlook' || provider === 'yahoo' || provider === 'zoho';
  const providerLabel =
    provider === 'gmail'
      ? 'Google'
      : provider === 'outlook'
        ? 'Outlook / Office 365'
        : provider === 'yahoo'
          ? 'Yahoo'
          : provider === 'zoho'
            ? 'Zoho Mail'
            : 'mailbox';

  const createMailbox = useCreateMailbox();
  const probe = useProbeCredentials();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  // Shared mailbox-create on success: create, then refresh /auth/me so
  // user.onboarding_status flips to 'mailbox_pending' and activeStage
  // auto-advances to 'dns' (no navigation needed).
  const finish = async (payload: Parameters<typeof createMailbox.mutateAsync>[0]) => {
    try {
      await createMailbox.mutateAsync(payload);
      // Reset DNS ack BEFORE the auth-me refresh fires the activeStage
      // recompute. Without this, a stale ack=true from a previous flow
      // would let activeStage skip straight from 'credentials' to 'start'
      // the moment onboarding_status flips to 'active', and the user
      // would never see the DNS verification panel.
      onMailboxCreated();
      toast.success('Mailbox connected — verifying DNS next.');
      try {
        const me = await api.get('/auth/me');
        if (me.data) {
          // Mirror the payment-success handler: write to BOTH stores so
          // the next render of `usePlan()` (which reads from the TanStack
          // cache via `useMe()`) sees the freshly-active onboarding_status
          // and plan tier without a one-render flicker.
          const refreshed = (me.data as { user?: typeof me.data } & typeof me.data).user ?? me.data;
          setUser(refreshed);
          queryClient.setQueryData(['auth', 'me'], refreshed);
        }
      } catch {
        /* non-fatal: invalidation below will refetch */
      }
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (err) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string } };
        message?: string;
      };
      const detail = e?.response?.data?.detail ?? '';
      const status = e?.response?.status;
      // 403 with "allows N mailbox(es)" / "trial allows" means the user
      // already hit the plan cap. During onboarding this usually means
      // they're trying to connect a second mailbox while one already
      // exists from a prior attempt — auto-advance them instead of
      // surfacing the raw API error.
      const isCapHit =
        status === 403 &&
        (/allows \d+ mailbox|trial allows|upgrade to add/i.test(detail));
      if (isCapHit) {
        toast.info('You already have a mailbox connected', {
          description: 'Continuing to DNS verification with your existing mailbox.',
        });
        onMailboxCreated();
        // Force the auth-me refetch so the parent picks up the existing
        // mailbox's onboarding_status and activeStage advances to 'dns'.
        try {
          const me = await api.get('/auth/me');
          if (me.data) {
            const refreshed = (me.data as { user?: typeof me.data } & typeof me.data).user ?? me.data;
            setUser(refreshed);
            queryClient.setQueryData(['auth', 'me'], refreshed);
          }
        } catch {
          /* non-fatal */
        }
        void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
        void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        return;
      }
      toast.error('Mailbox creation failed', {
        description: detail || e?.message || 'Try again.',
      });
    }
  };
  // Suppress unused-var lint until we re-add a navigate-out branch.
  void navigate;

  if (isAppPassword) {
    return (
      <>
        <DomainHelpLinks />
        <AppPasswordCard
          provider={(provider as 'gmail' | 'outlook' | 'yahoo' | 'zoho')}
          label={providerLabel}
          dailyVolume={dailyVolume}
          probe={probe}
          onFinish={finish}
          onChangeProvider={onChangeProvider}
        />
      </>
    );
  }

  return (
    <>
      <DomainHelpLinks />
      <SmtpConnectForm
        provider={provider}
        dailyVolume={dailyVolume}
        probe={probe}
        onFinish={finish}
        onChangeProvider={onChangeProvider}
      />
    </>
  );
}

/* ----- SMTP / IMAP form (Yahoo / Zoho / Generic SMTP) ----- */

function SmtpConnectForm({
  provider,
  dailyVolume,
  probe,
  onFinish,
  onChangeProvider,
}: {
  provider: string | null;
  dailyVolume: number;
  probe: ReturnType<typeof useProbeCredentials>;
  onFinish: (payload: Parameters<ReturnType<typeof useCreateMailbox>['mutateAsync']>[0]) => Promise<void>;
  onChangeProvider: () => void;
}) {
  const hosts = defaultHosts(provider);
  const [email, setEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState(hosts.smtp_host);
  const [smtpPort, setSmtpPort] = useState(hosts.smtp_port);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPwd, setSmtpPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [imapHost, setImapHost] = useState(hosts.imap_host);
  const [imapPort, setImapPort] = useState(hosts.imap_port);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Auto-fill username from email
  useEffect(() => {
    if (email && (!smtpUser || smtpUser.startsWith('@'))) setSmtpUser(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // MX-based detection: when the typed email's domain resolves to a known
  // managed provider (incl. the correct Zoho region), pre-fill the host/port —
  // but only while the fields are still untouched (empty or the static default)
  // so we never clobber a host the user typed by hand.
  const detection = useDetectProvider(email);
  const appliedHostRef = useRef<string | null>(null);
  useEffect(() => {
    const d = detection.data;
    if (!d || !d.smtp_host || appliedHostRef.current === d.smtp_host) return;
    const base = defaultHosts(provider);
    if (smtpHost === '' || smtpHost === base.smtp_host || smtpHost === appliedHostRef.current) {
      setSmtpHost(d.smtp_host);
      if (d.smtp_port) setSmtpPort(d.smtp_port);
    }
    if (imapHost === '' || imapHost === base.imap_host || imapHost === appliedHostRef.current) {
      if (d.imap_host) setImapHost(d.imap_host);
      if (d.imap_port) setImapPort(d.imap_port);
    }
    appliedHostRef.current = d.smtp_host;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detection.data]);

  // Re-verify required if anything credential-y changes
  useEffect(() => {
    setVerified(false);
  }, [email, smtpHost, smtpPort, smtpUser, smtpPwd, imapHost, imapPort]);

  const canTest = !!email && !!smtpHost && !!smtpPort && !!smtpUser && !!smtpPwd;

  const handleTest = async () => {
    setProbeError(null);
    try {
      await probe.mutateAsync({
        email_address: email,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_username: smtpUser,
        smtp_password: smtpPwd,
        imap_host: imapHost || undefined,
        imap_port: imapHost ? imapPort : undefined,
      });
      setVerified(true);
      toast.success('Login details verified');
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setProbeError(e?.response?.data?.detail ?? e?.message ?? 'Could not verify. Try again.');
    }
  };

  const handleSave = async () => {
    if (!verified) {
      await handleTest();
      if (!verified) return;
    }
    await onFinish({
      provider: (provider === 'yahoo' ? 'yahoo' : 'smtp') as
        | 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'smtp',
      email_address: email,
      daily_target: dailyVolume,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: smtpUser,
      smtp_password: smtpPwd,
      imap_host: imapHost || null,
      imap_port: imapHost ? imapPort : null,
      content_mode: 'A',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="onb-side__card onb-credentials"
    >
      <div className="onb-side__panel-head onb-side__panel-head--with-switch">
        <div>
          <span className="onb-side__panel-eyebrow">Step 5 · Connect mailbox</span>
          <h4 className="onb-side__title">Enter SMTP / IMAP login details</h4>
        </div>
        <button type="button" onClick={onChangeProvider} className="onb-side__switch">
          Switch provider
        </button>
      </div>

      <div className="onb-credentials__form">
        <label className="onb-credentials__field">
          <span className="onb-credentials__label">Email address *</span>
          <input
            type="email"
            placeholder="you@yourdomain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <fieldset className="onb-credentials__fieldset">
          <legend>Outgoing (SMTP)</legend>
          <div className="onb-credentials__row">
            <label className="onb-credentials__field" style={{ flex: 2, minWidth: 0 }}>
              <span className="onb-credentials__label">Host *</span>
              <input
                placeholder="smtp.yourprovider.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </label>
            <label className="onb-credentials__field" style={{ flex: 1, minWidth: 0 }}>
              <span className="onb-credentials__label">Port *</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="onb-credentials__field">
            <span className="onb-credentials__label">Username *</span>
            <input
              placeholder={email || 'usually your email'}
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
            />
          </label>
          <label className="onb-credentials__field">
            <span className="onb-credentials__label">Password *</span>
            <div className="onb-credentials__pwd">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="app password"
                value={smtpPwd}
                onChange={(e) => setSmtpPwd(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? 'Hide' : 'Show'}
                className="onb-credentials__pwd-toggle"
              >
                {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        </fieldset>

        <ProviderHelpDisclosure provider={provider ?? 'smtp'} />

        <fieldset className="onb-credentials__fieldset">
          <legend>Incoming (IMAP) — optional</legend>
          <p className="onb-credentials__hint">
            Leave blank for outbound-only warmup. For inbound opens and replies, use the same
            host pattern on port 993.
          </p>
          <div className="onb-credentials__row">
            <label className="onb-credentials__field" style={{ flex: 2, minWidth: 0 }}>
              <span className="onb-credentials__label">Host</span>
              <input
                placeholder="imap.yourdomain.com"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
              />
            </label>
            <label className="onb-credentials__field" style={{ flex: 1, minWidth: 0 }}>
              <span className="onb-credentials__label">Port</span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>

        <p className="onb-credentials__assurance">
          <ShieldCheck size={12} strokeWidth={2} />
          Login details encrypted at rest (Fernet). Most providers require an app-specific password.
        </p>

        {probeError && <p className="onb-credentials__error">{probeError}</p>}

        <div className="onb-credentials__actions">
          <button
            type="button"
            onClick={handleTest}
            disabled={!canTest || probe.isPending}
            className="onb-credentials__test"
          >
            {probe.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Testing…
              </>
            ) : verified ? (
              <>
                <CheckCircle2 size={12} strokeWidth={2.4} /> Verified
              </>
            ) : (
              'Test connection'
            )}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canTest}
            className="onb-side__inline-cta"
            style={!canTest ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            Save mailbox
            <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ----- App-password card (Outlook SMTP / Yahoo / Zoho) -----
   Cleaner UX than the full SMTP form: just email + app password.
   Hosts come from defaultHosts(); username = email. The "Outbound-only"
   checkbox suppresses the IMAP host so the probe doesn't fail when IMAP
   is disabled (common on Zoho free, Outlook work tenants, etc.).
============================================================================ */

function AppPasswordCard({
  provider,
  label,
  dailyVolume,
  probe,
  onFinish,
  onChangeProvider,
}: {
  provider: 'gmail' | 'outlook' | 'yahoo' | 'zoho';
  label: string;
  dailyVolume: number;
  probe: ReturnType<typeof useProbeCredentials>;
  onFinish: (payload: Parameters<ReturnType<typeof useCreateMailbox>['mutateAsync']>[0]) => Promise<void>;
  onChangeProvider: () => void;
}) {
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [skipImap, setSkipImap] = useState(false);
  const [verified, setVerified] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  // MX-based detection corrects the SMTP/IMAP host to the right data centre —
  // most importantly Zoho's region (smtp.zoho.in / .eu / .com.au), which the
  // static defaults can't know. We only override when the MX confirms the SAME
  // provider the user picked, so a mismatch never silently rewrites the host.
  const detection = useDetectProvider(email);
  const hosts = useMemo(() => {
    const base = defaultHosts(provider);
    const d = detection.data;
    if (d && d.provider === provider && d.smtp_host) {
      return {
        smtp_host: d.smtp_host,
        smtp_port: d.smtp_port ?? base.smtp_port,
        imap_host: d.imap_host ?? base.imap_host,
        imap_port: d.imap_port ?? base.imap_port,
      };
    }
    return base;
  }, [provider, detection.data]);

  const regionCorrected = hosts.smtp_host !== defaultHosts(provider).smtp_host;

  // Any keystroke after a successful probe invalidates verification.
  useEffect(() => {
    setVerified(false);
    setProbeError(null);
  }, [email, pwd, skipImap]);

  const canSubmit = !!email && !!pwd;

  const runProbe = async (skipImapOverride?: boolean): Promise<boolean> => {
    setProbeError(null);
    const effectiveSkip = skipImapOverride ?? skipImap;
    try {
      await probe.mutateAsync({
        email_address: email,
        smtp_host: hosts.smtp_host,
        smtp_port: hosts.smtp_port,
        smtp_username: email,
        smtp_password: pwd,
        imap_host: effectiveSkip ? undefined : hosts.imap_host,
        imap_port: effectiveSkip ? undefined : hosts.imap_port,
      });
      setVerified(true);
      toast.success('Login details verified');
      return true;
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setProbeError(e?.response?.data?.detail ?? e?.message ?? 'Could not verify. Try again.');
      return false;
    }
  };

  const handleSave = async () => {
    let ok = verified;
    if (!ok) ok = await runProbe();
    if (!ok) return;
    await onFinish({
      provider,
      email_address: email,
      smtp_host: hosts.smtp_host,
      smtp_port: hosts.smtp_port,
      smtp_username: email,
      smtp_password: pwd,
      imap_host: skipImap ? null : hosts.imap_host,
      imap_port: skipImap ? null : hosts.imap_port,
      daily_target: dailyVolume,
      content_mode: 'A',
    });
  };

  // If the probe failed specifically on IMAP, offer a one-click "retry
  // without IMAP" path — outbound-only is a valid warmup mode and most
  // users won't realise their provider blocks IMAP by default.
  const isImapFailure =
    !!probeError && probeError.toLowerCase().includes('imap');

  return (
    <motion.div
      key={`appp-${provider}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="onb-side__card onb-credentials"
    >
      <div className="onb-side__panel-head onb-side__panel-head--with-switch">
        <div>
          <span className="onb-side__panel-eyebrow">Step 5 · Connect {label}</span>
          <h4 className="onb-side__title">Sign in with an app password</h4>
        </div>
        <button type="button" onClick={onChangeProvider} className="onb-side__switch">
          Switch provider
        </button>
      </div>
      <p className="onb-side__help-body">
        Enter your {label} email + a 16-character app password. WarmPulse encrypts the password
        at rest with Fernet — it's never stored in plaintext.
      </p>

      {regionCorrected && (
        <p className="onb-credentials__assurance">
          <CheckCircle2 size={12} strokeWidth={2.4} />
          {detection.data?.zoho_region
            ? `Detected Zoho ${detection.data.zoho_region.toUpperCase()} region`
            : 'Detected your mail provider'}{' '}
          — connecting via <code>{hosts.smtp_host}</code>.
        </p>
      )}

      <div className="onb-credentials__form">
        <label className="onb-credentials__field">
          <span className="onb-credentials__label">Email address *</span>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="onb-credentials__field">
          <span className="onb-credentials__label">App password *</span>
          <div className="onb-credentials__pwd">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="16-char app password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              aria-label={showPwd ? 'Hide' : 'Show'}
              className="onb-credentials__pwd-toggle"
            >
              {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </label>

        <ProviderHelpDisclosure provider={provider} />

        <label className="onb-credentials__checkbox">
          <input
            type="checkbox"
            checked={skipImap}
            onChange={(e) => setSkipImap(e.target.checked)}
          />
          <span>
            <span className="onb-credentials__checkbox-title">Outbound-only warmup</span>
            <span className="onb-credentials__checkbox-sub">
              Skip the IMAP test
              {provider === 'zoho' ? ' (IMAP is off by default on most Zoho plans).' : '.'}
            </span>
          </span>
        </label>

        <p className="onb-credentials__assurance">
          <ShieldCheck size={12} strokeWidth={2} />
          Login details encrypted at rest (Fernet). Most providers require an app-specific
          password — your normal login password won't work.
        </p>

        {probeError && (
          <div className="onb-credentials__error-card">
            <p>{probeError}</p>
            {isImapFailure && !skipImap && (
              <button
                type="button"
                onClick={async () => {
                  setSkipImap(true);
                  await runProbe(true);
                }}
                className="onb-credentials__retry"
              >
                Retry without IMAP →
              </button>
            )}
          </div>
        )}

        <div className="onb-credentials__actions">
          <button
            type="button"
            onClick={() => void runProbe()}
            disabled={!canSubmit || probe.isPending}
            className="onb-credentials__test"
          >
            {probe.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Testing…
              </>
            ) : verified ? (
              <>
                <CheckCircle2 size={12} strokeWidth={2.4} /> Verified
              </>
            ) : (
              'Test connection'
            )}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSubmit || probe.isPending}
            className="onb-side__inline-cta"
            style={!canSubmit ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            Test & connect
            <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ============================================================================
   DNS panel — runs SPF / DKIM / DMARC check inline and surfaces provider-
   tailored fix instructions when any record fails. Consumer domains
   (gmail.com / outlook.com / etc.) skip the check entirely; for those the
   user can't publish records they don't own.
============================================================================ */

const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'zoho.com',
  'zohomail.com',
]);

function isConsumerDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (CONSUMER_DOMAINS.has(d)) return true;
  if (d.startsWith('yahoo.')) return true;
  return false;
}

/** SPF include directive per provider (used to construct the suggested record). */
function spfIncludeFor(provider: string | null): string {
  switch (provider) {
    case 'gmail':
      return 'include:_spf.google.com';
    case 'outlook':
      return 'include:spf.protection.outlook.com';
    case 'yahoo':
      return 'include:_spf.mail.yahoo.com';
    case 'zoho':
      return 'include:zoho.com';
    default:
      return 'include:<your-smtp-provider>';
  }
}

/** Recommended DKIM selector + host pattern per provider. */
function dkimSelectorFor(provider: string | null, domain: string): { selector: string; host: string } {
  switch (provider) {
    case 'gmail':
      return { selector: 'google', host: `google._domainkey.${domain}` };
    case 'outlook':
      return { selector: 'selector1', host: `selector1._domainkey.${domain}` };
    case 'yahoo':
      return { selector: 's1', host: `s1._domainkey.${domain}` };
    case 'zoho':
      return { selector: 'zoho', host: `zoho._domainkey.${domain}` };
    default:
      return { selector: '<selector>', host: `<selector>._domainkey.${domain}` };
  }
}

function copy(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    toast.error('Clipboard unavailable in this browser');
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success('Copied'),
    () => toast.error('Could not copy'),
  );
}

/** Keys for the three DNS records we surface, in the order they animate in. */
const DNS_KEYS = ['spf_valid', 'dkim_valid', 'dmarc_valid'] as const;
type DnsKey = (typeof DNS_KEYS)[number];

/** Stagger delays for the reveal animation (ms from check start). The actual
 *  API call usually completes in <100ms (dummy mode is instant), so these
 *  exist purely to give a tangible sense of three records being checked.
 *  Total animation ~270ms — fast enough to feel snappy, slow enough that the
 *  user notices the sequence. */
const REVEAL_DELAYS: Record<DnsKey, number> = {
  spf_valid: 30,
  dkim_valid: 70,
  dmarc_valid: 110,
};

function DnsPanel({
  emailAddress,
  provider,
  onContinue,
  onDnsFailed,
}: {
  emailAddress: string | null;
  provider: string | null;
  /** Advance to the final 'start' summary stage. Called from the DNS panel
   *  when the user is done reviewing — only fires when DNS actually passes
   *  (or is a consumer mailbox), since failed DNS now hides Continue. */
  onContinue: () => void;
  /** Fires whenever the computed "DNS is in a hard-fail state" flag flips.
   *  Lets the parent render its own belt-and-suspenders banner on the
   *  final summary stage. */
  onDnsFailed?: (failed: boolean) => void;
}) {
  const dns = useDnsCheck();
  const [mode, setMode] = useState<'idle' | 'running' | 'result' | 'unavailable'>('idle');
  /** Latched when the 15s watchdog fires — drives the all-failed synthetic
   *  result so every row renders a red X instead of an infinite spinner. */
  const [timedOut, setTimedOut] = useState<boolean>(false);
  /** Which record results have been "revealed" to the user. Drives the
   *  spinner → check/X animation. We stagger reveals over 1.5s regardless
   *  of how fast the backend responds, so the user gets a tangible sense of
   *  each record being checked in sequence. */
  const [revealed, setRevealed] = useState<Set<DnsKey>>(new Set());

  const domain = useMemo(
    () => (emailAddress ? emailAddress.split('@')[1] ?? '' : ''),
    [emailAddress],
  );

  const run = useMemo(
    () => () => {
      if (!emailAddress) return;
      setMode('running');
      setRevealed(new Set());
      setTimedOut(false);
      const isConsumer = isConsumerDomain(emailAddress.split('@')[1] ?? '');
      if (isConsumer) {
        // Consumer domains (gmail.com, outlook.com, ...) are provider-managed
        // — SPF/DKIM/DMARC are already published by Google/Microsoft/etc. and
        // we can't change them. Skip the real API call but still play the
        // staggered animation so the user gets visual confirmation, then
        // surface the "skipped" notice once the animation completes.
        const t = window.setTimeout(() => setMode('result'), REVEAL_DELAYS.dmarc_valid + 200);
        return () => window.clearTimeout(t);
      }
      // Watchdog: if we haven't heard from /workspace/dns/check in 15s,
      // treat the check as failed. Flips `timedOut` so the result resolver
      // returns an all-false synthetic record — every row renders a red X
      // and the user sees an explicit failure instead of an infinite spinner.
      let settled = false;
      const watchdog = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          setTimedOut(true);
          // Reveal every record so the X badges paint immediately rather
          // than waiting for the (already-completed) stagger timers.
          setRevealed(new Set(DNS_KEYS));
          setMode('result');
        }
      }, 15000);
      dns.mutate(
        { email_address: emailAddress },
        {
          onSuccess: () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(watchdog);
            setMode('result');
          },
          onError: () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(watchdog);
            setMode('unavailable');
          },
        },
      );
    },
    [dns, emailAddress],
  );

  // Auto-run on mount once we know the email.
  useEffect(() => {
    if (mode === 'idle' && emailAddress) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailAddress]);

  // Staggered reveal: schedule each record's flip from spinner → result.
  // Fires when we enter the 'running' state (since the API typically resolves
  // before all three timers fire, the result is already in dns.data by the
  // time the row reveals — so it renders the final check/X immediately).
  useEffect(() => {
    if (mode !== 'running') return;
    const timers = DNS_KEYS.map((key) =>
      window.setTimeout(() => {
        setRevealed((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }, REVEAL_DELAYS[key]),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [mode]);

  const consumer = isConsumerDomain(domain);
  /** Synthetic all-pass result for consumer domains (gmail.com etc.). Their
   *  SPF/DKIM/DMARC are published by the email provider, so they always
   *  resolve as valid in DNS lookups. We avoid hitting our own backend here
   *  for those domains. */
  const consumerResult: DnsCheckResponse = {
    spf_valid: true,
    dkim_valid: true,
    dmarc_valid: true,
  };
  /** Synthetic all-fail result for the 15s watchdog timeout. Rendered as
   *  three red X rows so the user sees an explicit "DNS check failed" state
   *  rather than an indefinite spinner. */
  const timedOutResult: DnsCheckResponse = {
    spf_valid: false,
    dkim_valid: false,
    dmarc_valid: false,
  };
  const result: DnsCheckResponse | undefined = timedOut
    ? timedOutResult
    : consumer
      ? consumerResult
      : dns.data;
  /** All three rows have finished their staggered reveal — used to gate the
   *  consumer-mailbox notice and the success summary so they don't appear
   *  mid-animation. */
  const animationDone = revealed.size === DNS_KEYS.length;

  const allPassed =
    mode === 'result' &&
    !!result &&
    result.spf_valid &&
    result.dkim_valid &&
    result.dmarc_valid;

  /** Hard-fail state — Continue is hidden and the parent shows a banner on
   *  the summary stage. True when:
   *   - the watchdog fired (all three rows render red X), OR
   *   - the API resolved with at least one record failing AND we're not on
   *     a consumer domain (consumer domains synthesize all-pass).
   *  Deliberately ignores `mode === 'unavailable'` (validator down) since
   *  that's a transient backend issue, not a user-facing DNS misconfig. */
  const dnsFailed =
    !consumer &&
    (timedOut ||
      (mode === 'result' &&
        !!result &&
        (!result.spf_valid || !result.dkim_valid || !result.dmarc_valid)));

  useEffect(() => {
    onDnsFailed?.(dnsFailed);
  }, [dnsFailed, onDnsFailed]);

  const spfRecord = `v=spf1 ${spfIncludeFor(provider)} ~all`;
  const { host: dkimHost } = dkimSelectorFor(provider, domain || 'yourdomain.com');
  const dmarcRecord = `v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain || 'yourdomain.com'}`;

  if (!emailAddress) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="onb-side__card"
      >
        <div className="onb-side__panel-head">
          <span className="onb-side__panel-eyebrow">Step 6 · Domain records (DNS)</span>
          <h4 className="onb-side__title">Connect a mailbox first</h4>
        </div>
        <p className="onb-side__help-body">
          Connect a mailbox in the previous step and we'll check SPF, DKIM and DMARC on its
          domain.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="dns"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="onb-side__card onb-dns"
    >
      <div className="onb-side__panel-head">
        <span className="onb-side__panel-eyebrow">Step 6 · Domain records (DNS)</span>
        <h4 className="onb-side__title">
          Verify <span className="onb-dns__domain">{domain || emailAddress}</span>
        </h4>
      </div>
      <p className="onb-side__help-body">
        WarmPulse checks SPF, DKIM and DMARC on your domain. All three must pass before warming
        starts — otherwise major mailbox providers will silently park your mail in spam.
      </p>

      {/* Scanning indicator — a thin gradient bar that sweeps left-to-right
          while the check is in flight. Gives the user a sense of activity
          even though the actual API call usually completes in <100ms. */}
      {!animationDone && (
        <div className="onb-dns__scan" aria-hidden>
          <div className="onb-dns__scan-bar" />
          <span className="onb-dns__scan-label">
            Scanning {domain || 'your domain'}…
          </span>
        </div>
      )}

      {/* The 3 rows render for every domain (consumer + custom). Each row
          stays in "spinner / pulse" state until its `revealed` flag flips in
          REVEAL_DELAYS sequence (500 / 1000 / 1500 ms), then animates from
          spinner → check/X with a brief scale bounce. */}
      <div className="onb-dns__rows">
        {DNS_KEYS.map((key, i) => {
          const label = key === 'spf_valid' ? 'SPF' : key === 'dkim_valid' ? 'DKIM' : 'DMARC';
          const isRevealed = revealed.has(key);
          const value = isRevealed && result ? result[key] : undefined;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.1 }}
              className={`onb-dns__row ${isRevealed ? 'onb-dns__row--revealed' : 'onb-dns__row--scanning'}`}
            >
              <span
                className={`onb-dns__dot ${
                  value === true
                    ? 'onb-dns__dot--ok'
                    : value === false
                      ? 'onb-dns__dot--err'
                      : 'onb-dns__dot--scanning'
                }`}
              >
                {!isRevealed ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : value === true ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ display: 'inline-flex' }}
                  >
                    <Check size={11} strokeWidth={2.8} />
                  </motion.span>
                ) : value === false ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ display: 'inline-flex' }}
                  >
                    <X size={11} strokeWidth={2.8} />
                  </motion.span>
                ) : (
                  <span className="onb-dns__dot-pending" />
                )}
              </span>
              <div className="onb-dns__row-body">
                <div className="onb-dns__row-title">{label}</div>
                <div className="onb-dns__row-hint">
                  {!isRevealed
                    ? 'Checking…'
                    : value === true
                      ? 'Looks good'
                      : value === false
                        ? 'Needs attention'
                        : '—'}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Everything below the rows is gated on `animationDone` so it
          doesn't pop in while the user is still watching the reveal play
          out. AnimatePresence makes the post-animation reveal smooth. */}
      {animationDone && consumer && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="onb-dns__notice onb-dns__notice--ok"
        >
          <CheckCircle2 size={14} strokeWidth={2.2} />
          <div>
            <p className="onb-dns__notice-title">Consumer mailbox — provider-managed.</p>
            <p className="onb-dns__notice-body">
              <span className="onb-dns__mono">{domain}</span> publishes SPF / DKIM / DMARC for
              you — there's nothing to add on your side. Heads-up: free consumer mailboxes warm
              more slowly than custom-domain mailboxes.
            </p>
          </div>
        </motion.div>
      )}

      {animationDone && !consumer && (
        <>

          {mode === 'unavailable' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="onb-dns__notice onb-dns__notice--warn"
            >
              <ShieldAlert size={14} strokeWidth={2.2} />
              <div>
                <p className="onb-dns__notice-title">Domain records (DNS) check unavailable.</p>
                <p className="onb-dns__notice-body">
                  We couldn't reach the validator. We'll run a check automatically on the server
                  once your mailbox is live.
                </p>
              </div>
            </motion.div>
          )}

          {mode === 'result' && result && (
            <>
              {allPassed ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="onb-dns__notice onb-dns__notice--ok"
                >
                  <CheckCircle2 size={14} strokeWidth={2.2} />
                  <div>
                    <p className="onb-dns__notice-title">All three records look healthy.</p>
                    <p className="onb-dns__notice-body">
                      Your domain is authenticated. Open the workspace to start your first
                      warmup cycle.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <DnsWalkthrough
                  domain={domain}
                  provider={provider}
                  spfMissing={!result.spf_valid}
                  dkimMissing={!result.dkim_valid}
                  dmarcMissing={!result.dmarc_valid}
                  spfRecord={spfRecord}
                  dkimHost={dkimHost}
                  dmarcHost={`_dmarc.${domain}`}
                  dmarcRecord={dmarcRecord}
                  rawFixes={result.fixes}
                />
              )}
            </>
          )}

        </>
      )}

      {/* Actions row sits OUTSIDE both `consumer` and `!consumer` blocks so
          every domain gets Re-check + Continue. Only appears after the
          staggered reveal completes — otherwise the user might smash
          Continue before they see what was checked.
          For consumer domains, Re-check replays the animation (the actual
          check is synthetic since records are provider-managed, but the
          user still gets visual confirmation that "yes, it ran again").
          The button's "busy" state is derived from the animation, not from
          `mode === 'running'`. Reason: there's a 200ms tail between the
          last row reveal (1500ms) and the consumer-mode setTimeout that
          flips mode to 'result' (1700ms) — and for slow custom-domain API
          calls the API can still be in flight after the animation. We
          want the button to read "Checking…" only when something real is
          still pending, not for that 200ms cosmetic gap. */}
      {animationDone && (
        <div className="onb-dns__actions">
          {/* `busy` only flips true if there's a REAL pending operation —
              i.e. a custom-domain API call still in flight after the
              animation completed. For consumer domains the API is skipped,
              so once the animation ends the button is immediately ready
              to re-fire. */}
          <button
            type="button"
            onClick={run}
            disabled={!consumer && mode === 'running'}
            className="onb-credentials__test"
          >
            {!consumer && mode === 'running' ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Checking…
              </>
            ) : (
              <>
                <RefreshCw size={12} strokeWidth={2.2} /> Re-check
              </>
            )}
          </button>
          {/* Continue is HARD-GATED on DNS passing. Failed-state hides the
              live button and shows a disabled locked CTA so the user can't
              skip past misconfigured DNS — warmup against unauthenticated
              mail goes straight to spam, so this protects the user's
              sender reputation before it's a problem. Re-check above is
              the recovery path. */}
          {dnsFailed ? (
            <div className="onb-dns__locked-wrap">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="onb-dns__locked-cta"
              >
                <ShieldAlert size={13} strokeWidth={2.2} />
                Fix DNS to continue
              </button>
              <p className="onb-dns__locked-hint">
                Warmup cannot start until SPF, DKIM and DMARC are published.
                Refresh after publishing.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onContinue}
              className="onb-side__inline-cta"
              style={{ marginTop: 0 }}
            >
              {consumer || allPassed ? 'Continue to summary' : 'Continue to summary'}
              <ArrowRight size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// DnsFixCard was replaced by DnsStepCard (richer visual walkthrough)
// when DNS verification became a hard gate.

/* --- Failed-DNS walkthrough --------------------------------------------
   Rich, visual fix-it experience that paints when at least one of SPF /
   DKIM / DMARC is missing (or the 15s watchdog tripped). Replaces the
   thin notice card with: a big header, numbered step cards, inline SVG
   diagrams illustrating what each record does, copy buttons for the
   host + value, and a propagation hint at the bottom. The Continue
   button in the panel is hidden while this is on screen — Re-check is
   the only forward path. */
function DnsWalkthrough({
  domain,
  provider,
  spfMissing,
  dkimMissing,
  dmarcMissing,
  spfRecord,
  dkimHost,
  dmarcHost,
  dmarcRecord,
  rawFixes,
}: {
  domain: string;
  provider: string | null;
  spfMissing: boolean;
  dkimMissing: boolean;
  dmarcMissing: boolean;
  spfRecord: string;
  dkimHost: string;
  dmarcHost: string;
  dmarcRecord: string;
  rawFixes?: Array<{ record: 'spf' | 'dkim' | 'dmarc'; instructions: string }>;
}) {
  // Step-card list — keep insertion order so step numbers (1/2/3) are
  // stable when only a subset is missing.
  const steps: Array<{
    key: 'spf' | 'dkim' | 'dmarc';
    label: 'SPF' | 'DKIM' | 'DMARC';
    explanation: string;
    host: string;
    value: string;
    providerHint?: string;
    diagram: ReactNode;
  }> = [];
  if (spfMissing) {
    steps.push({
      key: 'spf',
      label: 'SPF',
      explanation:
        'SPF tells receivers which servers are allowed to send mail for your domain.',
      host: '@',
      value: spfRecord,
      providerHint:
        'If a v=spf1 TXT already exists on @, merge the includes — never publish two SPF records.',
      diagram: <SpfDiagram />,
    });
  }
  if (dkimMissing) {
    steps.push({
      key: 'dkim',
      label: 'DKIM',
      explanation:
        'DKIM lets receivers verify mail wasn’t tampered with using a cryptographic signature.',
      host: dkimHost,
      value: '(generated in your provider’s admin)',
      providerHint:
        provider === 'gmail'
          ? 'Google Workspace Admin → Apps → Gmail → Authenticate email → generate a 2048-bit key with selector "google", then copy the TXT value here.'
          : provider === 'outlook'
            ? 'Microsoft Defender → Email auth → DKIM → enable signing, then publish both selector1 and selector2 CNAMEs Microsoft hands you.'
            : provider === 'zoho'
              ? 'Zoho Mail Admin → Domains → Email Configuration → DKIM → generate a key with selector "zoho", copy the public key into the TXT value.'
              : 'Generate a DKIM key in your provider’s admin panel — they’ll hand you the selector + TXT value to publish.',
      diagram: <DkimDiagram />,
    });
  }
  if (dmarcMissing) {
    steps.push({
      key: 'dmarc',
      label: 'DMARC',
      explanation:
        'DMARC ties SPF + DKIM together and tells receivers what to do when mail fails authentication.',
      host: dmarcHost,
      value: dmarcRecord,
      providerHint:
        'Start at p=none to monitor; tighten to p=quarantine after 2–4 weeks of clean reports.',
      diagram: <DmarcDiagram />,
    });
  }

  return (
    <div className="onb-dns__walkthrough">
      <div className="onb-dns__walkthrough-head">
        <div className="onb-dns__walkthrough-badge">
          <ShieldAlert size={14} strokeWidth={2.4} />
        </div>
        <div>
          <p className="onb-dns__walkthrough-title">
            Your domain needs{' '}
            {steps.length === 1 ? 'a domain record (DNS)' : `${steps.length} domain records (DNS)`}{' '}
            before we can warm up
          </p>
          <p className="onb-dns__walkthrough-sub">
            Until these are published on{' '}
            <span className="onb-dns__mono">{domain || 'your domain'}</span>, major mailbox
            providers will silently park your warmup mail in spam. Add each record below,
            then hit <strong>Re-check</strong> above.
          </p>
        </div>
      </div>

      <div className="onb-dns__steps">
        {steps.map((s, i) => (
          <DnsStepCard
            key={s.key}
            stepNumber={i + 1}
            label={s.label}
            explanation={s.explanation}
            host={s.host}
            value={s.value}
            providerHint={s.providerHint}
            diagram={s.diagram}
            domain={domain}
          />
        ))}
      </div>

      <p className="onb-dns__walkthrough-hint">
        <HelpCircle size={11} strokeWidth={2.4} />
        Need help? Most DNS hosts (Cloudflare, GoDaddy, Namecheap, Hostinger, Route 53)
        offer a 1-click setup wizard for SPF / DKIM / DMARC. Propagation usually takes
        5–15 minutes but can occasionally take up to an hour.
      </p>

      {rawFixes && rawFixes.length > 0 && (
        <details className="onb-dns__raw">
          <summary>Backend's own fix-it suggestions</summary>
          <div className="onb-dns__raw-body">
            {rawFixes.map((f) => (
              <div key={f.record} className="onb-dns__raw-row">
                <strong>{f.record.toUpperCase()}</strong>
                <pre>{f.instructions}</pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DnsStepCard({
  stepNumber,
  label,
  explanation,
  host,
  value,
  providerHint,
  diagram,
  domain,
}: {
  stepNumber: number;
  label: 'SPF' | 'DKIM' | 'DMARC';
  explanation: string;
  host: string;
  value: string;
  providerHint?: string;
  diagram: ReactNode;
  domain: string;
}) {
  return (
    <div className="onb-dns__step">
      <div className="onb-dns__step-left">
        <div className="onb-dns__step-num">{stepNumber}</div>
        <div className="onb-dns__step-diagram" aria-hidden>
          {diagram}
        </div>
      </div>
      <div className="onb-dns__step-body">
        <div className="onb-dns__step-head">
          <span className="onb-dns__step-label">{label}</span>
          <span className="onb-dns__step-type">TXT record</span>
        </div>
        <p className="onb-dns__step-explanation">{explanation}</p>

        <div className="onb-dns__step-record">
          <div className="onb-dns__fix-row">
            <span className="onb-dns__fix-key">Host</span>
            <code className="onb-dns__fix-val">{host}</code>
            <button
              type="button"
              onClick={() => copy(host)}
              className="onb-dns__fix-copy"
              aria-label={`Copy ${label} host`}
            >
              <Copy size={11} strokeWidth={2.2} />
            </button>
          </div>
          <div className="onb-dns__fix-row">
            <span className="onb-dns__fix-key">Value</span>
            <code className="onb-dns__fix-val">{value}</code>
            <button
              type="button"
              onClick={() => copy(value)}
              className="onb-dns__fix-copy"
              aria-label={`Copy ${label} value`}
            >
              <Copy size={11} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="onb-dns__step-where">
          <p className="onb-dns__step-where-title">Where to publish this</p>
          <ol className="onb-dns__step-where-list">
            <li>
              Log in to your DNS host (Cloudflare, GoDaddy, Namecheap, Hostinger,
              Route 53…).
            </li>
            <li>
              Find DNS settings for{' '}
              <span className="onb-dns__mono">{domain || 'your domain'}</span>.
            </li>
            <li>
              Add a new <strong>TXT</strong> record with Host ={' '}
              <span className="onb-dns__mono">{host}</span> and the Value shown
              above.
            </li>
            <li>Save. Propagation usually takes 5–15 minutes.</li>
            <li>Come back here and click <strong>Re-check</strong> above.</li>
          </ol>
        </div>

        {providerHint && (
          <p className="onb-dns__step-provider-hint">{providerHint}</p>
        )}
      </div>
    </div>
  );
}

/* --- Inline SVG diagrams (no external assets) -------------------------- */
function SpfDiagram() {
  // server -> cloud -> inbox flow
  return (
    <svg viewBox="0 0 72 56" width="68" height="52" role="img" aria-label="SPF flow">
      <defs>
        <linearGradient id="spfGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {/* server */}
      <rect x="3" y="18" width="14" height="20" rx="2" fill="url(#spfGrad)" />
      <rect x="5.5" y="22" width="9" height="1.6" fill="var(--wp-bg)" opacity="0.7" />
      <rect x="5.5" y="26" width="9" height="1.6" fill="var(--wp-bg)" opacity="0.7" />
      <rect x="5.5" y="30" width="6" height="1.6" fill="var(--wp-bg)" opacity="0.7" />
      {/* cloud */}
      <path
        d="M28 30 c0 -5 5 -8 9 -7 c1 -4 6 -5 9 -2 c4 -1 7 2 6 6 c2 1 2 5 -1 5 h-22 c-3 0 -4 -2 -1 -2 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.85"
      />
      {/* arrow 1 */}
      <path d="M18 28 L26 28" stroke="currentColor" strokeWidth="1.4" />
      <path d="M24 26 L26 28 L24 30" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* inbox */}
      <rect x="56" y="20" width="13" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M56 24 L62.5 30 L69 24" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* arrow 2 */}
      <path d="M50 28 L54 28" stroke="currentColor" strokeWidth="1.4" />
      <path d="M52 26 L54 28 L52 30" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DkimDiagram() {
  // padlock with key/wave
  return (
    <svg viewBox="0 0 72 56" width="68" height="52" role="img" aria-label="DKIM signature">
      {/* envelope */}
      <rect x="6" y="14" width="32" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 16 L22 28 L38 16" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* signature wave under envelope */}
      <path
        d="M8 42 q3 -3 6 0 t6 0 t6 0 t6 0 t6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.7"
      />
      {/* padlock */}
      <rect x="50" y="26" width="16" height="14" rx="2" fill="currentColor" opacity="0.85" />
      <path
        d="M53 26 v-3 a5 5 0 0 1 10 0 v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="58" cy="33" r="1.6" fill="var(--wp-bg)" />
    </svg>
  );
}

function DmarcDiagram() {
  // shield with SPF + DKIM badges inside
  return (
    <svg viewBox="0 0 72 56" width="68" height="52" role="img" aria-label="DMARC shield">
      <path
        d="M36 4 L62 12 v18 c0 12 -10 20 -26 22 c-16 -2 -26 -10 -26 -22 V12 z"
        fill="currentColor"
        opacity="0.16"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <text
        x="36"
        y="26"
        textAnchor="middle"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
        fill="currentColor"
      >
        SPF
      </text>
      <text
        x="36"
        y="38"
        textAnchor="middle"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
        fill="currentColor"
      >
        DKIM
      </text>
      <path
        d="M22 30 L36 30 L50 30"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
}
