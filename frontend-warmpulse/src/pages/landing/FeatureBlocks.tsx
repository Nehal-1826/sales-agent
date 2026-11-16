import { motion, type Variants } from 'framer-motion';
import { Users2, TrendingUp, Sparkles, Activity } from 'lucide-react';
import { Card } from '@/components/ui/Card';

// Alternate entrance direction per card (left/right fade-in).
const variantFromLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const variantFromRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

function RampChart() {
  // 5 → 10 → 20 → 35 → 50 → 100 normalized to viewBox height.
  const values = [5, 10, 20, 35, 50, 100];
  const max = 100;
  const w = 150;
  const h = 50;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h + 8}`} className="mt-4 h-14 w-full" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="#F26522"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * h}
          r="2"
          fill="#F26522"
        />
      ))}
      {values.map((v, i) => (
        <text
          key={`t-${i}`}
          x={i * step}
          y={h + 7}
          textAnchor="middle"
          fontSize="7"
          fontFamily="JetBrains Mono, monospace"
          fill="#8888a0"
        >
          {v}
        </text>
      ))}
    </svg>
  );
}

type Feature = {
  icon: typeof Users2;
  iconTint: string;
  title: string;
  description: string;
  stat: string;
  extra?: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: Users2,
    iconTint: 'bg-accent/10 text-accent',
    title: 'Test Accounts Network',
    description:
      'Over 1,000 real Google, Outlook, and Yahoo accounts that interact with your emails to show providers you are trustworthy.',
    stat: '1000+ real inboxes',
  },
  {
    icon: TrendingUp,
    iconTint: 'bg-accent2/10 text-accent2',
    title: 'Smart Volume Scaling',
    description:
      'Starts small and naturally increases your daily sends over 30 days. Pauses automatically if there are delivery issues.',
    stat: 'Day 1: 5 mails · Day 29+: 100/day',
    extra: <RampChart />,
  },
  {
    icon: Sparkles,
    iconTint: 'bg-accent3/10 text-accent3',
    title: 'AI-written emails',
    description:
      'Advanced AI writes unique, human-feeling email conversations — no templates, no duplicate content, so providers trust you.',
    stat: '~$0.003 / email · 4 content modes',
  },
  {
    icon: Activity,
    iconTint: 'bg-accent4/10 text-accent4',
    title: 'Real-time Sender Health',
    description:
      'A simple 0–100 score combining inbox placement, bounce rate, spam rate, and engagement — surfaced with alerts when health shifts.',
    stat: 'Google + Microsoft + blacklist checks',
  },
];

export function FeatureBlocks() {
  return (
    <section
      id="features"
      className="relative min-h-[60vh] w-full px-6 py-[120px]"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            What makes it work
          </span>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">
            Not a script farm. A real email network.
          </h2>
          <p className="mt-4 text-base text-text-dim md:text-lg">
            Tools that fake engagement get flagged. WarmPulse drives
            genuine inbox-to-inbox behaviour so email providers learn to trust you.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {FEATURES.map((f, idx) => {
            const Icon = f.icon;
            const variant = idx % 2 === 0 ? variantFromLeft : variantFromRight;
            return (
              <motion.div
                key={f.title}
                variants={variant}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <Card className="group h-full overflow-hidden p-7 transition-all duration-300 hover:border-accent/60 hover:shadow-[0_0_32px_rgba(242, 101, 34,0.1)]">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.iconTint}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-text">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-dim">
                    {f.description}
                  </p>
                  {f.extra}
                  <div className="mt-5 inline-flex items-center rounded-md border border-border-muted bg-surface-2 px-2.5 py-1">
                    <span className="font-mono text-[11px] text-accent2">
                      {f.stat}
                    </span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
