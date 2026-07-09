import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronRight,
  CornerDownLeft,
  Database,
  History,
  KeyRound,
  Palette,
  Plug,
  Search,
  Shield,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * ProPlusSet3Search — "Spotlight Search" Settings concept.
 *
 * Search-first settings surface modelled on iOS Spotlight / VSCode command
 * palette. A persistent search bar + category chips drive a live, fuzzy
 * filtered list of every individual setting in the product. Each row is a
 * complete inline editor — toggle / select / radio group / textfield — with
 * a category breadcrumb and a "recently changed" marker.
 *
 * Distinct from the doc/TOC, wizard, and profile-center sibling designs:
 *  - No long-form prose, no left-rail TOC, no anchor scrolling.
 *  - No stepwise wizard, no progress bar, no save-and-next.
 *  - No profile hero, no avatar, no big card hub.
 *
 * Standalone for the preview harness: prop-less, no router / network / query
 * hooks, all state is local. The fuzzy filter is a real subsequence match
 * with a first-index penalty (NOT a fake `.includes`).
 *
 * Animations (framer-motion):
 *  - search bar + chip row entrance.
 *  - result list re-orders on filter via `layout` + AnimatePresence.
 *  - selected-row highlight tracked across positions via `layoutId`.
 *  - inline-edit value-swap via AnimatePresence on the value text.
 *  - recently-changed dot pulses.
 *
 * Tailwind tokens only: bg-bg / bg-surface / bg-surface-2 / text-text /
 * text-text-dim / border-border-muted / text-accent / text-accent3 /
 * text-accent4.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

type Category =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'data'
  | 'integrations';

interface CategoryDef {
  key: Category;
  label: string;
  Icon: typeof UserIcon;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'profile', label: 'Profile', Icon: UserIcon },
  { key: 'security', label: 'Security', Icon: Shield },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'appearance', label: 'Appearance', Icon: Palette },
  { key: 'data', label: 'Data', Icon: Database },
  { key: 'integrations', label: 'Integrations', Icon: Plug },
];

const CATEGORY_MAP: Record<Category, CategoryDef> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<Category, CategoryDef>,
);

// ---------------------------------------------------------------------------
// Setting kinds + mock data
// ---------------------------------------------------------------------------

type SettingKind = 'toggle' | 'select' | 'input' | 'radio';

interface OptionDef {
  value: string;
  label: string;
}

type SettingValue = boolean | string;

interface SettingDef {
  id: string;
  category: Category;
  subgroup: string;
  label: string;
  description: string;
  kind: SettingKind;
  value: SettingValue;
  options?: OptionDef[];
  placeholder?: string;
  keywords?: string[];
  popular?: boolean;
  recentlyChanged?: boolean;
}

const MOCK: SettingDef[] = [
  // Profile
  {
    id: 'p-display-name',
    category: 'profile',
    subgroup: 'Account',
    label: 'Display name',
    description: 'Shown across WarmPulse and to admins on shared boards.',
    kind: 'input',
    value: 'Aanya Kapoor',
    placeholder: 'Your name',
    keywords: ['name', 'who'],
    popular: true,
  },
  {
    id: 'p-handle',
    category: 'profile',
    subgroup: 'Account',
    label: 'Workspace handle',
    description: 'Short slug used in mentions and report URLs.',
    kind: 'input',
    value: 'acme-india',
    placeholder: 'slug',
    keywords: ['slug', 'url', 'mention'],
  },
  {
    id: 'p-timezone',
    category: 'profile',
    subgroup: 'Locale',
    label: 'Timezone',
    description: 'Used for delivery windows and scheduled reports.',
    kind: 'select',
    value: 'Asia/Kolkata (UTC+5:30)',
    options: [
      { value: 'Asia/Kolkata (UTC+5:30)', label: 'Asia/Kolkata (UTC+5:30)' },
      { value: 'America/New_York (UTC-5)', label: 'America/New_York (UTC-5)' },
      {
        value: 'America/Los_Angeles (UTC-8)',
        label: 'America/Los_Angeles (UTC-8)',
      },
      { value: 'Europe/London (UTC+0)', label: 'Europe/London (UTC+0)' },
      { value: 'Europe/Berlin (UTC+1)', label: 'Europe/Berlin (UTC+1)' },
      { value: 'Australia/Sydney (UTC+11)', label: 'Australia/Sydney (UTC+11)' },
    ],
    keywords: ['tz', 'time', 'zone', 'clock'],
    popular: true,
  },
  {
    id: 'p-language',
    category: 'profile',
    subgroup: 'Locale',
    label: 'Interface language',
    description: 'UI translations — applies on next reload.',
    kind: 'select',
    value: 'English (US)',
    options: [
      { value: 'English (US)', label: 'English (US)' },
      { value: 'English (IN)', label: 'English (IN)' },
      { value: 'Hindi', label: 'Hindi' },
      { value: 'German', label: 'German' },
      { value: 'Japanese', label: 'Japanese' },
    ],
    keywords: ['locale', 'lang', 'i18n'],
  },

  // Security
  {
    id: 's-2fa',
    category: 'security',
    subgroup: 'Two-factor authentication',
    label: 'Authenticator app required',
    description: 'TOTP enforced on every sign-in for this account.',
    kind: 'toggle',
    value: true,
    keywords: ['2fa', 'totp', 'mfa', 'otp', 'auth'],
    popular: true,
  },
  {
    id: 's-recovery',
    category: 'security',
    subgroup: 'Two-factor authentication',
    label: 'Recovery codes auto-rotate',
    description: 'Issue a fresh set every 90 days; old codes invalidated.',
    kind: 'toggle',
    value: false,
    keywords: ['recovery', 'codes', 'rotate'],
  },
  {
    id: 's-session-length',
    category: 'security',
    subgroup: 'Sessions',
    label: 'Session length',
    description: 'How long a sign-in stays valid before re-authenticating.',
    kind: 'radio',
    value: '7d',
    options: [
      { value: '24h', label: '24 hours' },
      { value: '7d', label: '7 days' },
      { value: '30d', label: '30 days' },
    ],
    keywords: ['ttl', 'expire', 'sign out'],
    recentlyChanged: true,
  },
  {
    id: 's-ip-allowlist',
    category: 'security',
    subgroup: 'Access control',
    label: 'IP allowlist',
    description: 'Comma-separated CIDRs; empty disables the restriction.',
    kind: 'input',
    value: '103.21.0.0/16, 49.36.0.0/16',
    placeholder: '0.0.0.0/0',
    keywords: ['cidr', 'firewall', 'network'],
  },
  {
    id: 's-passkey',
    category: 'security',
    subgroup: 'Sign-in methods',
    label: 'Allow passkey sign-in',
    description: 'WebAuthn passkeys can be enrolled alongside TOTP.',
    kind: 'toggle',
    value: true,
    keywords: ['webauthn', 'fido', 'biometric'],
  },
  {
    id: 's-sso',
    category: 'security',
    subgroup: 'Sign-in methods',
    label: 'Enforce SSO for members',
    description: 'Members must sign in via your identity provider.',
    kind: 'toggle',
    value: false,
    keywords: ['saml', 'oidc', 'okta', 'idp'],
  },

  // Notifications
  {
    id: 'n-bounce',
    category: 'notifications',
    subgroup: 'Email alerts',
    label: 'Failed-delivery spike alerts',
    description: 'Email me when failure rate crosses the alert threshold.',
    kind: 'toggle',
    value: true,
    keywords: ['alert', 'bounce', 'threshold'],
    popular: true,
  },
  {
    id: 'n-digest',
    category: 'notifications',
    subgroup: 'Email alerts',
    label: 'Weekly sender-trust digest',
    description: 'Monday 09:00 in your timezone, per mailbox.',
    kind: 'toggle',
    value: true,
    keywords: ['digest', 'weekly', 'monday'],
  },
  {
    id: 'n-channel',
    category: 'notifications',
    subgroup: 'Channels',
    label: 'Primary channel',
    description: 'Where critical events are delivered first.',
    kind: 'radio',
    value: 'email',
    options: [
      { value: 'email', label: 'Email' },
      { value: 'in_app', label: 'In-app' },
      { value: 'push', label: 'Push' },
    ],
    keywords: ['channel', 'delivery'],
    recentlyChanged: true,
  },
  {
    id: 'n-quiet-from',
    category: 'notifications',
    subgroup: 'Quiet hours',
    label: 'Quiet hours start',
    description: 'No push notifications after this local time.',
    kind: 'input',
    value: '22:00',
    placeholder: 'HH:MM',
    keywords: ['quiet', 'dnd', 'do not disturb'],
  },
  {
    id: 'n-quiet-to',
    category: 'notifications',
    subgroup: 'Quiet hours',
    label: 'Quiet hours end',
    description: 'Push resumes at this local time.',
    kind: 'input',
    value: '07:00',
    placeholder: 'HH:MM',
    keywords: ['quiet', 'dnd', 'do not disturb'],
  },
  {
    id: 'n-product',
    category: 'notifications',
    subgroup: 'Marketing',
    label: 'Product changelog',
    description: 'Monthly feature launches — off by default.',
    kind: 'toggle',
    value: false,
    keywords: ['changelog', 'news', 'product'],
  },

  // Appearance
  {
    id: 'a-theme',
    category: 'appearance',
    subgroup: 'Theme',
    label: 'Color theme',
    description: 'Light, dark, or follow the operating system.',
    kind: 'radio',
    value: 'dark',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'system', label: 'System' },
    ],
    keywords: ['light', 'dark', 'mode', 'theme', 'palette'],
    popular: true,
  },
  {
    id: 'a-density',
    category: 'appearance',
    subgroup: 'Layout',
    label: 'Interface density',
    description: 'Comfortable spacing or compact for power users.',
    kind: 'radio',
    value: 'comfortable',
    options: [
      { value: 'comfortable', label: 'Comfortable' },
      { value: 'compact', label: 'Compact' },
    ],
    keywords: ['compact', 'spacing', 'density'],
  },
  {
    id: 'a-motion',
    category: 'appearance',
    subgroup: 'Motion',
    label: 'Reduce motion',
    description: 'Disable non-essential animations across the app.',
    kind: 'toggle',
    value: false,
    keywords: ['a11y', 'animation', 'motion'],
  },
  {
    id: 'a-accent',
    category: 'appearance',
    subgroup: 'Theme',
    label: 'Accent intensity',
    description: 'How saturated the accent gradients render.',
    kind: 'select',
    value: 'Bold',
    options: [
      { value: 'Soft', label: 'Soft' },
      { value: 'Balanced', label: 'Balanced' },
      { value: 'Bold', label: 'Bold' },
    ],
    keywords: ['accent', 'color', 'vibrant'],
  },

  // Data
  {
    id: 'd-retention',
    category: 'data',
    subgroup: 'Retention',
    label: 'Warmup log retention',
    description: 'How long inbox-level activity rows are kept.',
    kind: 'radio',
    value: '90d',
    options: [
      { value: '30d', label: '30 days' },
      { value: '90d', label: '90 days' },
      { value: '180d', label: '180 days' },
      { value: '365d', label: '365 days' },
    ],
    keywords: ['logs', 'retention', 'history'],
  },
  {
    id: 'd-export',
    category: 'data',
    subgroup: 'Export',
    label: 'Auto-export to email',
    description: 'Mail a CSV snapshot at the start of each month.',
    kind: 'toggle',
    value: false,
    keywords: ['csv', 'export', 'backup'],
  },
  {
    id: 'd-anon',
    category: 'data',
    subgroup: 'Privacy',
    label: 'Anonymize helper addresses in exports',
    description: 'Replace helper email addresses with hashed identifiers.',
    kind: 'toggle',
    value: true,
    keywords: ['gdpr', 'anonymize', 'hash', 'privacy'],
    recentlyChanged: true,
  },
  {
    id: 'd-region',
    category: 'data',
    subgroup: 'Residency',
    label: 'Data residency region',
    description: 'Where your warmup logs and reports are physically stored.',
    kind: 'select',
    value: 'ap-south-1 (Mumbai)',
    options: [
      { value: 'ap-south-1 (Mumbai)', label: 'ap-south-1 (Mumbai)' },
      { value: 'us-east-1 (Virginia)', label: 'us-east-1 (Virginia)' },
      { value: 'eu-west-1 (Ireland)', label: 'eu-west-1 (Ireland)' },
    ],
    keywords: ['residency', 'region', 'gdpr', 'dpdp'],
  },

  // Integrations
  {
    id: 'i-slack',
    category: 'integrations',
    subgroup: 'Slack',
    label: 'Slack notifications',
    description: 'Post failed-delivery-spike and digest events to a channel.',
    kind: 'toggle',
    value: true,
    keywords: ['slack', 'webhook', 'channel'],
    popular: true,
  },
  {
    id: 'i-slack-channel',
    category: 'integrations',
    subgroup: 'Slack',
    label: 'Slack channel',
    description: 'Which channel receives WarmPulse alerts.',
    kind: 'input',
    value: '#warmup-alerts',
    placeholder: '#channel',
    keywords: ['slack', 'channel'],
  },
  {
    id: 'i-webhook',
    category: 'integrations',
    subgroup: 'Webhooks',
    label: 'Webhook signing secret',
    description: 'HMAC secret for verifying outbound webhook payloads.',
    kind: 'input',
    value: 'whsec_••••••••••••••',
    placeholder: 'whsec_…',
    keywords: ['hmac', 'secret', 'webhook'],
  },
  {
    id: 'i-zapier',
    category: 'integrations',
    subgroup: 'Automations',
    label: 'Zapier integration',
    description: 'Allow Zapier zaps to trigger on warmup events.',
    kind: 'toggle',
    value: false,
    keywords: ['zapier', 'automation', 'zap'],
  },
  {
    id: 'i-api',
    category: 'integrations',
    subgroup: 'API',
    label: 'Default API version',
    description: 'Version used by new tokens; existing tokens are unchanged.',
    kind: 'select',
    value: '2026-04',
    options: [
      { value: '2024-11', label: '2024-11' },
      { value: '2025-06', label: '2025-06' },
      { value: '2026-04', label: '2026-04 (current)' },
    ],
    keywords: ['api', 'version', 'token'],
  },
  {
    id: 'i-rate',
    category: 'integrations',
    subgroup: 'API',
    label: 'API rate limit window',
    description: 'Burst window for outbound API calls per token.',
    kind: 'radio',
    value: '60s',
    options: [
      { value: '10s', label: '10 seconds' },
      { value: '60s', label: '60 seconds' },
      { value: '300s', label: '5 minutes' },
    ],
    keywords: ['rate', 'limit', 'throttle'],
  },
];

// ---------------------------------------------------------------------------
// Fuzzy match — real subsequence scorer with first-index penalty.
// ---------------------------------------------------------------------------

/**
 * Subsequence fuzzy score.
 * Returns null if `query` is not a subsequence of `text` (case-insensitive),
 * else a non-negative score where LOWER is better:
 *   - first matched index (so matches near the start outrank tail matches)
 *   - + gap penalty (sum of distances between consecutive matches)
 */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (firstIdx < 0) firstIdx = i;
      if (lastIdx >= 0) gaps += i - lastIdx - 1;
      lastIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  return firstIdx + gaps * 2;
}

function searchableText(s: SettingDef): string {
  const base = [
    s.label,
    s.subgroup,
    CATEGORY_MAP[s.category].label,
    s.description,
    typeof s.value === 'string' ? s.value : '',
    ...(s.keywords ?? []),
  ];
  return base.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Curated = 'all' | 'popular' | 'recent';

export function ProPlusSet3Search(): JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [curated, setCurated] = useState<Curated>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [values, setValues] = useState<Record<string, SettingValue>>(() => {
    const out: Record<string, SettingValue> = {};
    for (const s of MOCK) out[s.id] = s.value;
    return out;
  });
  const [editedIds, setEditedIds] = useState<Set<string>>(() => {
    // Pre-seed the "recently changed" rows so the marker is meaningful at first paint.
    const out = new Set<string>();
    for (const s of MOCK) if (s.recentlyChanged) out.add(s.id);
    return out;
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-focus the search bar on mount — Spotlight behaviour.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Apply category + curated filter, then fuzzy score + sort.
  const results = useMemo(() => {
    const filtered = MOCK.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (curated === 'popular' && !s.popular) return false;
      if (curated === 'recent' && !editedIds.has(s.id)) return false;
      return true;
    });

    if (!query.trim()) {
      // No query: stable order by category index, then by label.
      const catOrder: Record<Category, number> = {
        profile: 0,
        security: 1,
        notifications: 2,
        appearance: 3,
        data: 4,
        integrations: 5,
      };
      return filtered
        .map((s) => ({ s, score: 0 }))
        .sort((a, b) => {
          const c = catOrder[a.s.category] - catOrder[b.s.category];
          if (c !== 0) return c;
          return a.s.label.localeCompare(b.s.label);
        });
    }

    const scored: Array<{ s: SettingDef; score: number }> = [];
    for (const s of filtered) {
      const sc = fuzzyScore(query, searchableText(s));
      if (sc !== null) scored.push({ s, score: sc });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored;
  }, [query, category, curated, editedIds]);

  // Clamp selected index whenever the result list changes shape.
  useEffect(() => {
    if (results.length === 0) {
      setSelectedIdx(0);
      return;
    }
    setSelectedIdx((idx) => Math.min(idx, results.length - 1));
  }, [results.length]);

  const selectedRow = results[selectedIdx]?.s;

  // Scroll the selected row into view as the user arrow-keys through.
  useEffect(() => {
    if (!selectedRow) return;
    const el = rowRefs.current[selectedRow.id];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedRow]);

  const commit = useCallback((id: string, next: SettingValue) => {
    setValues((prev) => ({ ...prev, [id]: next }));
    setEditedIds((prev) => {
      const out = new Set(prev);
      out.add(id);
      return out;
    });
  }, []);

  function onSearchKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((idx) => Math.min(idx + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((idx) => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter') {
      if (!selectedRow) return;
      e.preventDefault();
      // Focus the row's inline control.
      const el = rowRefs.current[selectedRow.id];
      const focusable = el?.querySelector<HTMLElement>(
        'button[role="switch"], select, input[type="text"], button[data-radio]',
      );
      focusable?.focus();
    } else if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        setQuery('');
      }
    }
  }

  const totalChanged = editedIds.size;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col gap-4">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Settings
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Spotlight — type to find any setting, then edit it in place.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <ShortcutHint icon={<ArrowUp className="h-3 w-3" />} />
          <ShortcutHint icon={<ArrowDown className="h-3 w-3" />} />
          <span className="text-text-dim/80">navigate</span>
          <ShortcutHint icon={<CornerDownLeft className="h-3 w-3" />} />
          <span className="text-text-dim/80">edit</span>
        </div>
      </motion.header>

      {/* Search + chips */}
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: 'easeOut', delay: 0.05 }}
        className="space-y-3"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-dim" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search every setting — try 'theme', 'bounce', 'session', 'slack'…"
            aria-label="Search settings"
            className="h-14 w-full rounded-2xl border border-border-muted bg-surface px-12 text-base text-text outline-none transition-colors placeholder:text-text-dim/70 focus:border-accent/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category row */}
        <div
          role="tablist"
          aria-label="Filter by category"
          className="flex flex-wrap items-center gap-2"
        >
          <Chip
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label="All"
            count={MOCK.length}
          />
          {CATEGORIES.map((c) => {
            const count = MOCK.filter((s) => s.category === c.key).length;
            return (
              <Chip
                key={c.key}
                active={category === c.key}
                onClick={() => setCategory(c.key)}
                label={c.label}
                count={count}
                Icon={c.Icon}
              />
            );
          })}
          <span className="mx-1 h-5 w-px bg-border-muted/70" aria-hidden />
          <CuratedChip
            active={curated === 'all'}
            onClick={() => setCurated('all')}
            label="Any"
          />
          <CuratedChip
            active={curated === 'popular'}
            onClick={() => setCurated('popular')}
            label="Popular"
            Icon={Sparkles}
          />
          <CuratedChip
            active={curated === 'recent'}
            onClick={() => setCurated('recent')}
            label="Recently changed"
            Icon={History}
            count={totalChanged}
          />
        </div>
      </motion.div>

      {/* Results header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-end justify-between"
      >
        <p className="text-xs uppercase tracking-wider text-text-dim">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
          {query && (
            <>
              {' '}
              for <span className="text-text">"{query}"</span>
            </>
          )}
        </p>
        <p className="text-xs text-text-dim/80">
          {selectedRow ? (
            <>
              <span className="text-text-dim">Selected:</span>{' '}
              <span className="text-text">{selectedRow.label}</span>
            </>
          ) : (
            'No selection'
          )}
        </p>
      </motion.div>

      {/* Results list — internal scroll */}
      <motion.div
        ref={listRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border-muted bg-surface"
      >
        {results.length === 0 ? (
          <NoResults query={query} onReset={() => setQuery('')} />
        ) : (
          <ul className="divide-y divide-border-muted/60">
            <AnimatePresence initial={false}>
              {results.map((r, i) => {
                const s = r.s;
                const current = values[s.id] ?? s.value;
                const isSelected = i === selectedIdx;
                const isChanged = editedIds.has(s.id);
                return (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      layout: { duration: 0.28, ease: 'easeOut' },
                      opacity: { duration: 0.18 },
                    }}
                  >
                    <div
                      ref={(el) => {
                        rowRefs.current[s.id] = el;
                      }}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className="relative flex items-start gap-4 px-4 py-3.5"
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="spotlight-selected-highlight"
                          aria-hidden
                          className="absolute inset-x-2 inset-y-1 -z-[1] rounded-xl border border-accent/30 bg-accent/8"
                          transition={{
                            type: 'spring',
                            stiffness: 380,
                            damping: 32,
                          }}
                        />
                      )}
                      <CategoryGlyph category={s.category} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-text">
                            {s.label}
                          </span>
                          {isChanged && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent4">
                              <motion.span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full bg-accent4"
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{
                                  duration: 1.6,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }}
                              />
                              Recently changed
                            </span>
                          )}
                          {s.popular && (
                            <span className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-text-dim">
                          <BreadcrumbIcon category={s.category} />
                          <span>{CATEGORY_MAP[s.category].label}</span>
                          <ChevronRight className="h-3 w-3 opacity-60" />
                          <span>{s.subgroup}</span>
                        </div>
                        <p className="text-xs text-text-dim">{s.description}</p>
                      </div>
                      <div className="ml-2 shrink-0">
                        <InlineControl
                          setting={s}
                          value={current}
                          onChange={(next) => commit(s.id, next)}
                        />
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </motion.div>

      {/* Footer status */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-text-dim"
      >
        <span>
          {MOCK.length} settings indexed · fuzzy match across labels, keywords
          and current values.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" />
          Auto-save on edit
        </span>
      </motion.footer>
    </div>
  );
}

export default ProPlusSet3Search;

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function ShortcutHint({ icon }: { icon: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border-muted bg-surface-2 text-text-dim">
      {icon}
    </span>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  Icon?: typeof UserIcon;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'text-text'
          : 'text-text-dim hover:bg-surface-2 hover:text-text'
      }`}
    >
      {active && (
        <motion.span
          layoutId="spotlight-chip-pill"
          aria-hidden
          className="absolute inset-0 -z-[1] rounded-full border border-accent/30 bg-accent/10"
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        />
      )}
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {typeof count === 'number' && (
        <span
          className={`ml-0.5 rounded-full px-1.5 text-[10px] font-medium ${
            active ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CuratedChip({
  active,
  onClick,
  label,
  Icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  Icon?: typeof Sparkles;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent4/40 bg-accent4/10 text-accent4'
          : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="rounded-full bg-bg/40 px-1.5 text-[10px]">{count}</span>
      )}
    </button>
  );
}

function CategoryGlyph({ category }: { category: Category }) {
  const def = CATEGORY_MAP[category];
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim"
    >
      <def.Icon className="h-4 w-4" />
    </span>
  );
}

function BreadcrumbIcon({ category }: { category: Category }) {
  const def = CATEGORY_MAP[category];
  return <def.Icon className="h-3 w-3 text-text-dim/80" />;
}

function NoResults({
  query,
  onReset,
}: {
  query: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-muted bg-surface-2 text-text-dim">
        <Search className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-text">
        Nothing matches "{query}"
      </p>
      <p className="mt-1 max-w-sm text-xs text-text-dim">
        Try a shorter query, or remove the active category and curated filters.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-full border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-accent/40 hover:text-accent"
      >
        Clear search
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline controls — toggle / select / input / radio
// ---------------------------------------------------------------------------

function InlineControl({
  setting,
  value,
  onChange,
}: {
  setting: SettingDef;
  value: SettingValue;
  onChange: (next: SettingValue) => void;
}) {
  switch (setting.kind) {
    case 'toggle':
      return (
        <ToggleControl
          on={Boolean(value)}
          onChange={(on) => onChange(on)}
          label={setting.label}
        />
      );
    case 'select':
      return (
        <SelectControl
          value={String(value)}
          options={setting.options ?? []}
          onChange={onChange}
          ariaLabel={setting.label}
        />
      );
    case 'input':
      return (
        <InputControl
          value={String(value)}
          placeholder={setting.placeholder}
          onChange={onChange}
          ariaLabel={setting.label}
        />
      );
    case 'radio':
      return (
        <RadioControl
          value={String(value)}
          options={setting.options ?? []}
          onChange={onChange}
          ariaLabel={setting.label}
        />
      );
  }
}

function ToggleControl({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={on ? 'on' : 'off'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={`text-xs font-medium ${on ? 'text-accent' : 'text-text-dim'}`}
        >
          {on ? 'On' : 'Off'}
        </motion.span>
      </AnimatePresence>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? 'bg-accent' : 'bg-surface-2 border border-border-muted'
        }`}
      >
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow-sm"
          animate={{ left: on ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </button>
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: OptionDef[];
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="hidden text-xs text-text-dim sm:inline"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-border-muted bg-surface-2 px-2 text-xs text-text outline-none transition-colors hover:border-accent/40 focus:border-accent/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-text">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function InputControl({
  value,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-44 rounded-lg border border-border-muted bg-surface-2 px-2.5 text-xs text-text outline-none transition-colors placeholder:text-text-dim/60 hover:border-accent/40 focus:border-accent/60 sm:w-56"
    />
  );
}

function RadioControl({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: OptionDef[];
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border-muted bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const isOn = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-radio
            role="radio"
            aria-checked={isOn}
            onClick={() => onChange(o.value)}
            className={`relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isOn ? 'text-bg' : 'text-text-dim hover:text-text'
            }`}
          >
            {isOn && (
              <motion.span
                layoutId={`radio-${ariaLabel}`}
                aria-hidden
                className="absolute inset-0 -z-[1] rounded-md bg-accent"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {isOn && <Check className="-ml-0.5 mr-1 inline h-3 w-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
