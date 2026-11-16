import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, DEMO_SENDS_30D } from '../pro-dashboards/demoData';
import { toneFor } from '../pro-mailboxes/shared';

/**
 * N6 — Trend Timeline. Big interactive time-series with annotated events.
 * Top: scrubbable 30-day timeline with markers for key milestones.
 * Bottom: charts that update based on selected range.
 */

interface Annotation {
  day: number;
  type: 'milestone' | 'alert' | 'event';
  label: string;
  detail: string;
}

const ANNOTATIONS: Annotation[] = [
  { day: 4, type: 'event', label: 'eli@ added', detail: 'New mailbox connected' },
  { day: 9, type: 'milestone', label: 'Warmth 60+', detail: '3 mailboxes crossed warmth 60' },
  { day: 14, type: 'alert', label: 'Bounce spike', detail: 'dana@ bounce rate exceeded 1%' },
  { day: 22, type: 'milestone', label: 'Inbox ≥ 85%', detail: 'Workspace inbox placement hit 87%' },
  { day: 28, type: 'event', label: 'Pro ramp', detail: 'All mailboxes at daily target' },
];

export function N6Timeline() {
  const [range, setRange] = useState<'7d' | '14d' | '30d'>('30d');
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
  const sliceData = DEMO_SENDS_30D.slice(-days);

  return (
    <div className="n6">
      {/* Date range toolbar */}
      <header className="n6__head">
        <span className="n6-eyebrow"><CalendarRange size={11} strokeWidth={2.4} />30-day trend timeline</span>
        <div className="n6__range">
          {(['7d', '14d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`n6__range-chip ${range === r ? 'n6__range-chip--active' : ''}`}
            >
              {r === '7d' ? '7 days' : r === '14d' ? '14 days' : '30 days'}
            </button>
          ))}
        </div>
      </header>

      {/* Big chart with annotations */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="n6__chart-card"
      >
        <div className="n6__chart-stats">
          <div>
            <span className="n6__stat-lbl">Sent · {range}</span>
            <span className="n6__stat-num">{sliceData.reduce((s, n) => s + n, 0)}</span>
          </div>
          <div>
            <span className="n6__stat-lbl">Avg warmth</span>
            <span className="n6__stat-num">{DEMO_AGGREGATE.avgWarmth}</span>
          </div>
          <div>
            <span className="n6__stat-lbl">Annotations</span>
            <span className="n6__stat-num">{ANNOTATIONS.filter((a) => 30 - a.day < days).length}</span>
          </div>
        </div>
        <TimelineChart data={sliceData} annotations={ANNOTATIONS.filter((a) => 30 - a.day < days)} totalDays={days} />
      </motion.section>

      {/* Annotation feed */}
      <section className="n6__annotations">
        <header className="n6-panel-head">
          <span><Sparkles size={11} strokeWidth={2.4} /> Annotated events</span>
          <span className="n6-panel-meta">{ANNOTATIONS.filter((a) => 30 - a.day < days).length} markers in range</span>
        </header>
        <ul className="n6__ann-list">
          {ANNOTATIONS.filter((a) => 30 - a.day < days).map((a, i) => (
            <motion.li
              key={a.day}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: i * 0.04 }}
              className={`n6__ann n6__ann--${a.type}`}
            >
              <span className="n6__ann-day">D-{30 - a.day}</span>
              <span className={`n6__ann-icon n6__ann-icon--${a.type}`}>
                {a.type === 'milestone' ? <TrendingUp size={11} strokeWidth={2.4} /> :
                 a.type === 'alert' ? <Zap size={11} strokeWidth={2.4} /> :
                 <Sparkles size={11} strokeWidth={2.4} />}
              </span>
              <div className="n6__ann-body">
                <span className="n6__ann-label">{a.label}</span>
                <span className="n6__ann-detail">{a.detail}</span>
              </div>
            </motion.li>
          ))}
        </ul>
      </section>

      {/* Per-mailbox row */}
      <section className="n6__mb-row">
        {DEMO_MAILBOXES.map((m) => (
          <div key={m.id} className={`n6__mb-tile n6__mb-tile--${toneFor(m)}`}>
            <span className="n6__mb-name">{m.email.split('@')[0]}</span>
            <span className="n6__mb-warmth">{m.warmth}</span>
            <span className="n6__mb-trend">
              {m.spark[m.spark.length - 1]! > m.spark[0]! ? '↑' : '↓'}
              {Math.abs(m.spark[m.spark.length - 1]! - m.spark[0]!)} pts
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function TimelineChart({ data, annotations, totalDays }: { data: number[]; annotations: Annotation[]; totalDays: number }) {
  const W = 800, H = 220, PAD_X = 20, PAD_Y = 30;
  const max = Math.max(...data);
  const step = (W - PAD_X * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({ x: PAD_X + i * step, y: H - PAD_Y - (v / max) * (H - PAD_Y * 2) }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1]!.x} ${H - PAD_Y} L ${pts[0]!.x} ${H - PAD_Y} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="n6__svg">
      <defs>
        <linearGradient id="n6-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y - p * (H - PAD_Y * 2)} y2={H - PAD_Y - p * (H - PAD_Y * 2)} stroke="#1f1f1f" strokeDasharray="2 6" />
      ))}
      <path d={area} fill="url(#n6-grad)" />
      <path d={path} fill="none" stroke="#FF9670" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />

      {/* Annotations as vertical markers */}
      {annotations.map((a) => {
        const dayIdx = data.length - (30 - a.day) - 1;
        if (dayIdx < 0 || dayIdx >= data.length) return null;
        const x = PAD_X + dayIdx * step;
        const color = a.type === 'milestone' ? '#3ddc97' : a.type === 'alert' ? '#ff5c7a' : '#FF9670';
        return (
          <g key={a.day}>
            <line x1={x} x2={x} y1={PAD_Y * 0.5} y2={H - PAD_Y} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <circle cx={x} cy={PAD_Y * 0.5} r={5} fill={color} />
            <text x={x + 8} y={PAD_Y * 0.5 + 3} fontSize={9} fill={color} fontWeight={700} fontFamily="JetBrains Mono">
              D-{30 - a.day}
            </text>
          </g>
        );
      })}

      {/* End dot */}
      <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r={3.5} fill="#FF9670" />

      {/* X-axis labels */}
      {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
        <text key={i} x={PAD_X + i * step} y={H - 8} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontWeight={700} fontFamily="JetBrains Mono">
          D-{totalDays - i - 1}
        </text>
      ))}
    </svg>
  );
}
