/**
 * Per-tier configuration for the redesigned /app/tools area.
 *
 * One source of truth for how each plan tier presents the Tools landing and
 * the Template Designer. The shared primitives (TierShell, ToolLauncher) read
 * a TierConfig and swap shell kind / density / motion / accent accordingly —
 * Starter clean & calm → Agency premium command center.
 */
import type { LucideIcon } from 'lucide-react';
import { Target, ShieldCheck, FileEdit, Eye } from 'lucide-react';

export type Tier = 'starter' | 'pro' | 'pro_plus' | 'agency';
export type ShellKind = 'list' | 'tabs' | 'lab' | 'workbench';
export type MotionLevel = 'none' | 'subtle' | 'reveal' | 'spring';

export interface TierConfig {
  tier: Tier;
  shellKind: ShellKind;
  title: string;
  subtitle: string;
  motion: MotionLevel;
  /** Tailwind grid columns for the launcher. */
  columns: string;
  /** Premium chrome: gradient hero + glow (Agency). */
  glow: boolean;
  /** Show the ⌘K hint + bulk affordances (Agency). */
  commandBar: boolean;
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  starter: {
    tier: 'starter',
    shellKind: 'list',
    title: 'Tools',
    subtitle: 'Your deliverability toolkit — run a check whenever you need one.',
    motion: 'none',
    columns: 'grid-cols-1',
    glow: false,
    commandBar: false,
  },
  pro: {
    tier: 'pro',
    shellKind: 'tabs',
    title: 'Pro Tools',
    subtitle: 'A faster workbench — jump between tools and pick up where you left off.',
    motion: 'subtle',
    columns: 'grid-cols-1 sm:grid-cols-2',
    glow: false,
    commandBar: false,
  },
  pro_plus: {
    tier: 'pro_plus',
    shellKind: 'lab',
    title: 'Experiment Lab',
    subtitle: 'Live deliverability instruments wired to your own mailboxes.',
    motion: 'reveal',
    columns: 'grid-cols-1 sm:grid-cols-2',
    glow: false,
    commandBar: false,
  },
  agency: {
    tier: 'agency',
    shellKind: 'workbench',
    title: 'Agency Workbench',
    subtitle: 'Every instrument, every client — one premium command center.',
    motion: 'spring',
    columns: 'grid-cols-1 sm:grid-cols-2',
    glow: true,
    commandBar: true,
  },
};

export interface ToolDef {
  slug: 'placement' | 'spam' | 'templates' | 'preview';
  to: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  /** Lowest tier where the tool is fully usable; below this the tool page
   *  itself shows a functional upgrade CTA (never a dead button). */
  minTier: Tier;
}

const TIER_RANK: Record<Tier, number> = {
  starter: 0,
  pro: 1,
  pro_plus: 2,
  agency: 3,
};

export const TOOLS: ToolDef[] = [
  {
    slug: 'placement',
    to: '/app/tools/placement',
    label: 'Inbox Test',
    desc: 'See where you land — inbox, promotions, or spam — across providers.',
    Icon: Target,
    minTier: 'pro_plus',
  },
  {
    slug: 'spam',
    to: '/app/tools/spam',
    label: 'Spam Scanner',
    desc: 'Scan your content for spam triggers before you hit send.',
    Icon: ShieldCheck,
    minTier: 'pro',
  },
  {
    slug: 'templates',
    to: '/app/tools/templates',
    label: 'Template Designer',
    desc: 'Compose and preview warmup email templates with live rendering.',
    Icon: FileEdit,
    minTier: 'starter',
  },
  {
    slug: 'preview',
    to: '/app/tools/preview',
    label: 'Warmup Preview',
    desc: 'Preview how a warmup thread reads in the recipient inbox.',
    Icon: Eye,
    minTier: 'starter',
  },
];

/** True when `tier` can fully use a tool requiring `minTier`. */
export function tierMeets(tier: Tier, minTier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minTier];
}
