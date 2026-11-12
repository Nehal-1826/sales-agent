import { motion, type Variants } from 'framer-motion';
import { Mailbox } from 'lucide-react';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const stepVariant: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const PEER_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [40, 30],
  [40, 130],
  [220, 30],
  [220, 130],
  [20, 80],
  [240, 80],
];

function PeerNetworkDiagram() {
  // Simple inline SVG — a central mailbox with five peers passing edges.
  return (
    <svg
      viewBox="0 0 260 160"
      className="h-24 w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F26522" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#F26522" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF8A4B" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {/* edges */}
      {PEER_POSITIONS.map(([x, y], i) => (
        <line
          key={i}
          x1="130"
          y1="80"
          x2={x}
          y2={y}
          stroke="url(#edge)"
          strokeWidth="1"
          strokeDasharray="3 3"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-12"
            dur="2s"
            repeatCount="indefinite"
          />
        </line>
      ))}
      {/* peer nodes */}
      {PEER_POSITIONS.map(([x, y], i) => (
        <circle
          key={`p-${i}`}
          cx={x}
          cy={y}
          r="8"
          fill="rgba(255, 138, 75,0.12)"
          stroke="#FF8A4B"
          strokeWidth="1"
        />
      ))}
      {/* center user mailbox */}
      <circle cx="130" cy="80" r="14" fill="rgba(242, 101, 34,0.15)" stroke="#F26522" strokeWidth="1.5" />
      <text
        x="130"
        y="84"
        textAnchor="middle"
        fontSize="11"
        fontFamily="JetBrains Mono, monospace"
        fill="#F26522"
      >
        you
      </text>
    </svg>
  );
}

const SPARKLINE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 72],
  [15, 68],
  [30, 62],
  [45, 52],
  [60, 48],
  [75, 36],
  [90, 30],
  [105, 22],
  [120, 18],
  [135, 14],
  [150, 10],
];

function Sparkline() {
  // Warmth score climb 18 → 92 over ~30 days.
  const d = SPARKLINE_POINTS.map(([x, y], i) =>
    i === 0 ? `M${x},${y}` : `L${x},${y}`,
  ).join(' ');
  return (
    <svg viewBox="0 0 150 90" className="h-24 w-full" aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F26522" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L150,90 L0,90 Z`} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke="#F26522" strokeWidth="2" strokeLinecap="round" />
      <circle cx="150" cy="10" r="3" fill="#F26522" />
      <text
        x="150"
        y="8"
        textAnchor="end"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fill="#F26522"
      >
        92
      </text>
    </svg>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Connect your inbox',
    description:
      'OAuth Gmail or Outlook in under 30 seconds — SMTP/IMAP credentials are Fernet-encrypted at rest.',
    visual: (
      <div className="flex h-24 items-center justify-center">
        <Mailbox className="h-14 w-14 text-accent" strokeWidth={1.25} />
      </div>
    ),
  },
  {
    n: '02',
    title: 'Our peer network engages',
    description:
      'Hundreds of real Google Workspace, O365, and Yahoo inboxes send, open, reply, and rescue from Spam on a human cadence.',
    visual: <PeerNetworkDiagram />,
  },
  {
    n: '03',
    title: 'Watch your Warmth Score climb',
    description:
      'A composite 0–100 score blends placement, bounce, spam, and engagement — updated in real time from Postmaster & SNDS signals.',
    visual: <Sparkline />,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
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
            How it works
          </span>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">
            Three steps between you and the inbox.
          </h2>
          <p className="mt-4 text-base text-text-dim md:text-lg">
            Both outbound and inbound warmup cycles matter — ESPs score
            bidirectional engagement, and we run both for you.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.n}
              variants={stepVariant}
              className="group relative rounded-2xl border border-border-muted bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-[0_0_32px_rgba(242, 101, 34,0.08)]"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-text-dim">
                {step.n}
              </span>
              <h3 className="mt-3 text-xl font-semibold text-text">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">
                {step.description}
              </p>
              <div className="mt-6 rounded-xl border border-border-muted bg-bg/40 p-4">
                {step.visual}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
