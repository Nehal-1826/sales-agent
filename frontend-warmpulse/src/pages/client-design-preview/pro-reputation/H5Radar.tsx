import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Target } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { getMailboxHealth } from './shared';

/**
 * H5 — Radar Overlay. 5 mailboxes as overlapping radar polygons.
 * 5-axis: Warmth · SPF · DKIM · DMARC · Auth.
 * Click legend to toggle visibility.
 */

const COLORS = ['#F26522', '#FF9670', '#3ddc97', '#ffb454', '#ff5c7a'];
const AXES = ['Warmth', 'SPF', 'DKIM', 'DMARC', 'Auth'];

interface Axis {
  values: number[]; // 5 values, 0-100
  color: string;
  visible: boolean;
}

export function H5Radar() {
  const allHealth = DEMO_MAILBOXES.map(getMailboxHealth);

  const [visibility, setVisibility] = useState<boolean[]>(
    DEMO_MAILBOXES.map(() => true),
  );
  const [hovered, setHovered] = useState<number | null>(null);

  const polys: Axis[] = allHealth.map((h, i) => ({
    values: [
      h.warmth,
      h.mailbox.spfOk ? 100 : 0,
      h.mailbox.dkimOk ? 100 : 0,
      h.mailbox.dmarcOk ? 100 : 0,
      h.auth,
    ],
    color: COLORS[i % COLORS.length]!,
    visible: visibility[i]!,
  }));

  return (
    <div className="h5">
      <header className="h5__head">
        <span className="h5-eyebrow">
          <Target size={11} strokeWidth={2.4} />
          Radar overlay · 5 mailboxes on one chart
        </span>
        <span className="h5__head-meta">click legend to isolate</span>
      </header>

      <div className="h5__body">
        {/* Radar */}
        <section className="h5__radar-card">
          <RadarChart polys={polys} hoveredIdx={hovered} />
        </section>

        {/* Legend / mailbox toggles */}
        <aside className="h5__legend">
          <header className="h5-panel-head">
            <span>Mailboxes</span>
            <button
              type="button"
              className="h5__toggle-all"
              onClick={() => {
                const allOn = visibility.every((v) => v);
                setVisibility(visibility.map(() => !allOn));
              }}
            >
              {visibility.every((v) => v) ? 'Hide all' : 'Show all'}
            </button>
          </header>

          {allHealth.map((h, i) => {
            const color = COLORS[i % COLORS.length]!;
            const visible = visibility[i]!;
            return (
              <motion.button
                key={h.mailbox.id}
                type="button"
                onClick={() => setVisibility(visibility.map((v, j) => (i === j ? !v : v)))}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: i * 0.05 }}
                className={`h5__legend-row ${visible ? '' : 'h5__legend-row--off'}`}
              >
                <span className="h5__legend-color" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <ProviderSwatch provider={h.mailbox.provider} size={22} />
                <div className="h5__legend-text">
                  <span className="h5__legend-email">{h.mailbox.email.split('@')[0]}</span>
                  <span className="h5__legend-sub">{providerLabel(h.mailbox.provider)}</span>
                </div>
                <span className={`h5__legend-score h5__legend-score--${h.tone}`}>{h.composite}</span>
                <span className="h5__legend-eye">
                  {visible ? <Eye size={11} strokeWidth={2.4} /> : <EyeOff size={11} strokeWidth={2.4} />}
                </span>
              </motion.button>
            );
          })}

          <footer className="h5__legend-foot">
            <span className="h5__legend-foot-lbl">Avg composite</span>
            <strong className="h5__legend-foot-num">
              {Math.round(allHealth.reduce((s, h) => s + h.composite, 0) / allHealth.length)}
            </strong>
          </footer>
        </aside>
      </div>

      {/* Per-axis breakdown strip */}
      <section className="h5__axes">
        {AXES.map((axis, axisIdx) => {
          const vals = polys.filter((p) => p.visible).map((p) => p.values[axisIdx]!);
          const avg = vals.length === 0 ? 0 : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
          const tone = avg >= 80 ? 'success' : avg >= 50 ? 'warning' : 'danger';
          return (
            <div key={axis} className="h5__axis">
              <span className="h5__axis-lbl">{axis}</span>
              <span className={`h5__axis-num h5__axis-num--${tone}`}>{avg}</span>
              <span className="h5__axis-bar">
                <span className={`h5__axis-fill h5__axis-fill--${tone}`} style={{ width: `${avg}%` }} />
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RadarChart({ polys, hoveredIdx }: { polys: Axis[]; hoveredIdx: number | null }) {
  const cx = 200, cy = 180, R = 130;
  const N = AXES.length;

  function pt(axisIdx: number, val: number) {
    const angle = (axisIdx * 2 * Math.PI) / N - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }
  function axisPt(axisIdx: number, r: number) {
    const angle = (axisIdx * 2 * Math.PI) / N - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }

  return (
    <svg viewBox="0 0 400 360" className="h5__radar-svg" preserveAspectRatio="xMidYMid meet">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((scale) => {
        const points = AXES.map((_, i) => axisPt(i, R * scale));
        return (
          <polygon
            key={scale}
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#1f1f1f"
            strokeWidth={1}
            strokeDasharray={scale === 1 ? undefined : '3 4'}
          />
        );
      })}
      {/* Axis lines */}
      {AXES.map((_, i) => {
        const p = axisPt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#1f1f1f" strokeWidth={1} />;
      })}
      {/* Axis labels */}
      {AXES.map((axis, i) => {
        const p = axisPt(i, R + 22);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={700}
            fill="#a1a1aa"
            fontFamily="Outfit, sans-serif"
          >
            {axis}
          </text>
        );
      })}
      {/* Polygons */}
      {polys.map((p, i) => {
        if (!p.visible) return null;
        const points = p.values.map((v, axisIdx) => pt(axisIdx, v));
        const isHover = hoveredIdx === i;
        const isDim = hoveredIdx !== null && hoveredIdx !== i;
        return (
          <g key={i} opacity={isDim ? 0.18 : 1} style={{ transition: 'opacity 200ms' }}>
            <polygon
              points={points.map((q) => `${q.x},${q.y}`).join(' ')}
              fill={p.color}
              fillOpacity={isHover ? 0.32 : 0.16}
              stroke={p.color}
              strokeWidth={isHover ? 2.2 : 1.4}
              style={{ transition: 'fill-opacity 200ms, stroke-width 200ms' }}
            />
            {points.map((q, j) => (
              <circle key={j} cx={q.x} cy={q.y} r={isHover ? 3.5 : 2.2} fill={p.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
