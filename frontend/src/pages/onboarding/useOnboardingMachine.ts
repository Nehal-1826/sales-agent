import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useAuthStore, type OnboardingStatus } from '@/stores/auth';

/**
 * Onboarding draft — persisted to sessionStorage so a refresh (or accidental tab close
 * during the OAuth dance) doesn't drop the user's progress. The backend is the source
 * of truth for `onboarding_status`; everything in here is the *uncommitted* wizard input.
 */
export interface OnboardingDraft {
  plan_id: string | null;
  daily_volume: number | null;
  provider: 'gmail' | 'outlook' | 'outlook_oauth' | 'yahoo' | 'zoho' | 'smtp' | null;
  email_address: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  imap_host: string | null;
  imap_port: number | null;
  oauth_token: string | null;
  content_mode: 'A' | 'B' | 'C' | 'D' | null;
  schedule_window: {
    tz: string;
    weekday_mask: number;
    start_hour: number;
    end_hour: number;
  } | null;
  auto_crm_enabled: boolean;
  /** Local wizard cursor (1..7). Only meaningful after onboarding_status === 'plan_selected'. */
  wizardStep: number;
  /** Client-only UI flag — after DummyPayment succeeds we optimistically render the wizard
   *  even if /auth/me hasn't been re-fetched yet. Cleared once status flips to plan_selected. */
  paymentConfirmed: boolean;
  /** True only after the credentials currently in the draft passed a live SMTP/IMAP probe.
   *  Cleared whenever email_address / smtp_password / SMTP host change so a tampered draft
   *  can never advance Step 3. */
  credentials_verified: boolean;
}

const STORAGE_KEY = 'warmpulse:onboarding-draft';
const TOTAL_STEPS = 7;

const defaultDraft: OnboardingDraft = {
  plan_id: null,
  daily_volume: null,
  provider: null,
  email_address: null,
  smtp_host: null,
  smtp_port: 587,
  smtp_username: null,
  smtp_password: null,
  imap_host: null,
  imap_port: 993,
  oauth_token: null,
  content_mode: 'A', // spec §6.2 — A is default recommendation
  schedule_window: null,
  auto_crm_enabled: true,
  wizardStep: 1,
  paymentConfirmed: false,
  credentials_verified: false,
};

function loadDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return defaultDraft;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDraft;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return { ...defaultDraft, ...parsed };
  } catch {
    return defaultDraft;
  }
}

function saveDraft(draft: OnboardingDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage can throw in private-mode or when full; we silently degrade —
    // the draft then only lives for the lifetime of the JS context.
  }
}

type Action =
  | { type: 'patch'; patch: Partial<OnboardingDraft> }
  | { type: 'reset' }
  | { type: 'setStep'; step: number };

const CRED_FIELDS = [
  'email_address',
  'smtp_password',
  'smtp_host',
  'smtp_port',
  'smtp_username',
  'imap_host',
  'imap_port',
] as const;

function reducer(state: OnboardingDraft, action: Action): OnboardingDraft {
  switch (action.type) {
    case 'patch': {
      // Any change to a credential field invalidates the prior verification.
      // The probe panel must explicitly set credentials_verified=true when it
      // re-passes; otherwise Step 3 stays gated.
      const touchesCreds = CRED_FIELDS.some((k) => k in action.patch);
      const verified =
        'credentials_verified' in action.patch
          ? !!action.patch.credentials_verified
          : touchesCreds
            ? false
            : state.credentials_verified;
      return { ...state, ...action.patch, credentials_verified: verified };
    }
    case 'setStep':
      return { ...state, wizardStep: Math.min(Math.max(action.step, 1), TOTAL_STEPS) };
    case 'reset':
      return { ...defaultDraft };
    default:
      return state;
  }
}

export type WizardPhase = 'plan' | 'payment' | 'wizard' | 'done';

export interface OnboardingMachine {
  draft: OnboardingDraft;
  status: OnboardingStatus | null;
  phase: WizardPhase;
  step: number;
  totalSteps: number;
  patch: (patch: Partial<OnboardingDraft>) => void;
  setStep: (step: number) => void;
  advance: () => void;
  goBack: () => void;
  reset: () => void;
  /** Must the user linearly advance? yes — /app gates on active. */
  canAdvance: boolean;
  canGoBack: boolean;
}

/**
 * Derives the effective phase from (backend `onboarding_status`, local `paymentConfirmed`,
 * local `wizardStep`) and exposes helpers to mutate the draft safely.
 *
 * Order of precedence (highest first):
 *  1. `status === 'active'` → done (caller redirects to /app)
 *  2. `status === 'mailbox_pending'` → jump to step 6 (Confirm)
 *  3. `status === 'plan_selected'` (or paymentConfirmed locally) → wizard step N
 *  4. `status === 'signed_up'` → plan picker, then payment once plan_id is set
 */
export function useOnboardingMachine(): OnboardingMachine {
  const user = useAuthStore((s) => s.user);
  const status = user?.onboarding_status ?? null;
  const [draft, dispatch] = useReducer(reducer, undefined, loadDraft);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // If the backend moves us to mailbox_pending, force the cursor to step 6.
  useEffect(() => {
    if (status === 'mailbox_pending' && draft.wizardStep !== TOTAL_STEPS) {
      dispatch({ type: 'setStep', step: TOTAL_STEPS });
    }
  }, [status, draft.wizardStep]);

  // Once the backend confirms plan_selected, we no longer need the optimistic flag.
  useEffect(() => {
    if (status === 'plan_selected' && draft.paymentConfirmed) {
      dispatch({ type: 'patch', patch: { paymentConfirmed: false } });
    }
  }, [status, draft.paymentConfirmed]);

  const phase: WizardPhase = useMemo(() => {
    if (status === 'active') return 'done';
    if (status === 'mailbox_pending') return 'wizard';
    if (status === 'plan_selected') return 'wizard';
    // signed_up (or unknown): trust the backend over a stale local flag.
    // paymentConfirmed alone (without backend agreement) must NOT gate into the wizard,
    // otherwise the user hits mailbox-create with user.plan_id=null and gets a 403.
    if (draft.plan_id) return 'payment';
    return 'plan';
  }, [status, draft.plan_id]);

  const patch = useCallback((p: Partial<OnboardingDraft>) => {
    dispatch({ type: 'patch', patch: p });
  }, []);

  const setStep = useCallback((step: number) => {
    dispatch({ type: 'setStep', step });
  }, []);

  const advance = useCallback(() => {
    dispatch({ type: 'setStep', step: Math.min(draft.wizardStep + 1, TOTAL_STEPS) });
  }, [draft.wizardStep]);

  const goBack = useCallback(() => {
    dispatch({ type: 'setStep', step: Math.max(draft.wizardStep - 1, 1) });
  }, [draft.wizardStep]);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return {
    draft,
    status,
    phase,
    step: draft.wizardStep,
    totalSteps: TOTAL_STEPS,
    patch,
    setStep,
    advance,
    goBack,
    reset,
    canAdvance: draft.wizardStep < TOTAL_STEPS,
    canGoBack: draft.wizardStep > 1,
  };
}

export const ONBOARDING_TOTAL_STEPS = TOTAL_STEPS;
