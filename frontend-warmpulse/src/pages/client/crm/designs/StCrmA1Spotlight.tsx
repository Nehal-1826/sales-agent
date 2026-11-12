import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  KanbanSquare,
  Target,
  Mail,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type DealCard = { name: string; company: string; value: string };
type KanbanColumn = { label: string; tone: 'faint' | 'accent' | 'success'; cards: DealCard[] };
type ValueItem = { icon: typeof KanbanSquare; title: string; body: string };

const columns: KanbanColumn[] = [
  {
    label: 'New',
    tone: 'faint',
    cards: [
      { name: 'Dana Reyes', company: 'Northwind', value: '$2.4k' },
      { name: 'Owen Pratt', company: 'Lumio Labs', value: '$1.8k' },
    ],
  },
  {
    label: 'Interested',
    tone: 'accent',
    cards: [
      { name: 'Mara Quinn', company: 'Brightpath', value: '$6.0k' },
      { name: 'Ravi Seth', company: 'Orbit Co.', value: '$3.5k' },
    ],
  },
  {
    label: 'Won',
    tone: 'success',
    cards: [{ name: 'Lena Voss', company: 'Acre Foods', value: '$12k' }],
  },
];

const valueItems: ValueItem[] = [
  {
    icon: KanbanSquare,
    title: 'Kanban pipeline',
    body: 'Drag leads from first reply to closed deal across stages you control.',
  },
  {
    icon: Target,
    title: 'Deal tracking',
    body: 'Attach values, owners and notes so nothing slips between follow-ups.',
  },
  {
    icon: Mail,
    title: 'Email sequences',
    body: 'Automate multi-step outreach off the inbox you are already warming.',
  },
];

function chipClasses(tone: KanbanColumn['tone']): string {
  if (tone === 'success') {
    return 'border-[color:color-mix(in_srgb,var(--wp-success,#3ddc97)_45%,transparent)] text-[color:var(--wp-success,#3ddc97)] bg-[color:color-mix(in_srgb,var(--wp-success,#3ddc97)_12%,transparent)]';
  }
  if (tone === 'accent') {
    return 'border-accent/40 text-accent bg-accent/[0.10]';
  }
  return 'border-border-muted text-text-faint bg-surface-2';
}

export function StCrmA1Spotlight() {
  return (
    <div className="space-y-6">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-border-muted bg-surface p-8 md:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--wp-accent, #F26522) 38%, transparent), transparent)',
          }}
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-3 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              Paid add-on
            </span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-text md:text-4xl">
              Warm the inbox.
              <br />
              Then close the deal.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-text-dim">
              CRM is a paid add-on for Starter. Track every lead from first reply to closed deal,
              right next to the mailboxes you are already warming.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/app/billing">
                  Upgrade to add CRM
                  <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/app/billing">Compare plans</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-text-faint">
              Pro 3 campaigns · Pro Plus 10 · Agency unlimited
            </p>
          </div>

          {/* RIGHT — animated mini-Kanban teaser */}
          <div aria-hidden className="relative">
            <div className="grid grid-cols-3 gap-3">
              {columns.map((col, ci) => (
                <div key={col.label} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-text-dim">
                      {col.label}
                    </span>
                    <span className="text-[11px] text-text-faint">{col.cards.length}</span>
                  </div>
                  {col.cards.map((card, idx) => (
                    <motion.div
                      key={card.name}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.25 + ci * 0.12 + idx * 0.1 }}
                      className="rounded-2xl border border-border-muted bg-surface-2 p-3"
                    >
                      <p className="truncate text-sm font-medium text-text">{card.name}</p>
                      <p className="truncate text-xs text-text-dim">{card.company}</p>
                      <span
                        className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${chipClasses(col.tone)}`}
                      >
                        {card.value}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-2xl"
              style={{
                background: 'linear-gradient(to top, var(--wp-surface, #14110f), transparent)',
              }}
            />
          </div>
        </div>
      </motion.section>

      {/* VALUE ROW */}
      <div className="grid gap-4 md:grid-cols-3">
        {valueItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              className="rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-accent/40"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/[0.08] text-accent">
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-text">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-dim">{item.body}</p>
            </motion.div>
          );
        })}
      </div>

      {/* UPGRADE BAND */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.05] p-8 text-center md:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--wp-accent-2, #FF8A4B) 30%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-xl">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.10] text-accent">
            <TrendingUp className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-text md:text-3xl">
            Ready to fill your pipeline?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-dim">
            Add the CRM to your Starter plan and turn warmed-up replies into tracked, closeable
            deals.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild size="lg">
              <Link to="/app/billing">
                Upgrade to add CRM
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
              </Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

export default StCrmA1Spotlight;
