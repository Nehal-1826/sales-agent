import { Activity, BarChart3, Inbox, PieChart, Sparkles, Target } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, DEMO_SENDS_30D } from '../pro-dashboards/demoData';
import { toneFor } from '../pro-mailboxes/shared';

/**
 * N2 — Multi-Chart Wall. Grafana-style 6 independent chart panels.
 */
export function N2ChartWall() {
  return (
    <div className="n2">
      <header className="n2__head">
        <span className="n2-eyebrow"><BarChart3 size={11} strokeWidth={2.4} />Workspace analytics</span>
        <div className="n2__head-stats">
          <span><strong>{DEMO_AGGREGATE.avgWarmth}</strong> avg warmth</span>
          <span><strong>{DEMO_AGGREGATE.totalSentToday}</strong> sends</span>
          <span><strong>{DEMO_AGGREGATE.opensToday}</strong> opens</span>
          <span><strong>{DEMO_AGGREGATE.repliesToday}</strong> replies</span>
        </div>
      </header>

      <div className="n2__grid">
        {/* Panel 1: Warmth trend */}
        <section className="n2__panel">
          <header className="n2-panel-head">
            <span><Sparkles size={10} strokeWidth={2.4} /> WARMTH · 30D</span>
            <span className="n2-panel-meta">+12 pts</span>
          </header>
          <WarmthAreaChart />
        </section>

        {/* Panel 2: Sends bars */}
        <section className="n2__panel">
          <header className="n2-panel-head">
            <span><BarChart3 size={10} strokeWidth={2.4} /> SENDS · 30D</span>
            <span className="n2-panel-meta">+18% wow</span>
          </header>
          <SendsBars />
        </section>

        {/* Panel 3: Placement donut */}
        <section className="n2__panel">
          <header className="n2-panel-head">
            <span><Inbox size={10} strokeWidth={2.4} /> PLACEMENT</span>
            <span className="n2-panel-meta">87% inbox</span>
          </header>
          <PlacementDonut />
        </section>

        {/* Panel 4: Engagement radar */}
        <section className="n2__panel">
          <header className="n2-panel-head">
            <span><Target size={10} strokeWidth={2.4} /> ENGAGEMENT</span>
            <span className="n2-panel-meta">5 axes</span>
          </header>
          <EngagementRadar />
        </section>

        {/* Panel 5: Per-mailbox bars */}
        <section className="n2__panel n2__panel--wide">
          <header className="n2-panel-head">
            <span><Activity size={10} strokeWidth={2.4} /> PER-MAILBOX WARMTH</span>
            <span className="n2-panel-meta">{DEMO_MAILBOXES.length} mailboxes</span>
          </header>
          <div className="n2__mb-bars">
            {DEMO_MAILBOXES.map((m) => (
              <div key={m.id} className="n2__mb-bar">
                <span className="n2__mb-bar-name">{m.email.split('@')[0]}</span>
                <div className="n2__mb-bar-track">
                  <span className={`n2__mb-bar-fill n2__mb-bar-fill--${toneFor(m)}`} style={{ width: `${m.warmth}%` }} />
                </div>
                <span className="n2__mb-bar-val">{m.warmth}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 6: Provider mix */}
        <section className="n2__panel">
          <header className="n2-panel-head">
            <span><PieChart size={10} strokeWidth={2.4} /> PROVIDER MIX</span>
            <span className="n2-panel-meta">5 boxes</span>
          </header>
          <ProviderMix />
        </section>
      </div>
    </div>
  );
}

function WarmthAreaChart() {
  const data = [50, 55, 58, 61, 64, 67, 70, 72, 74, 76, 78, 80, 82, 84];
  const W = 220, H = 100, PAD = 4;
  const max = 100;
  const step = (W - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({ x: PAD + i * step, y: H - PAD - (v / max) * (H - PAD * 2) }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1]!.x} ${H - PAD} L ${pts[0]!.x} ${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="n2__svg">
      <defs><linearGradient id="n2-violet" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F26522" stopOpacity={0.4} /><stop offset="100%" stopColor="#F26522" stopOpacity={0} /></linearGradient></defs>
      <path d={area} fill="url(#n2-violet)" />
      <path d={path} fill="none" stroke="#FF9670" strokeWidth={1.5} />
    </svg>
  );
}

function SendsBars() {
  const data = DEMO_SENDS_30D;
  const W = 220, H = 100, PAD = 2;
  const max = Math.max(...data);
  const bw = (W - PAD * 2) / data.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="n2__svg">
      {data.map((v, i) => {
        const h = (v / max) * (H - PAD * 2);
        return <rect key={i} x={PAD + i * (bw + 1)} y={H - PAD - h} width={bw} height={h} rx={1} fill="#FF9670" opacity={0.9} />;
      })}
    </svg>
  );
}

function PlacementDonut() {
  const slices = [
    { value: 87, color: '#3ddc97' },
    { value: 9, color: '#ffb454' },
    { value: 4, color: '#ff5c7a' },
  ];
  const R = 32, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="n2__donut-wrap">
      <svg viewBox="0 0 100 100" className="n2__svg">
        <circle cx={50} cy={50} r={R} fill="none" stroke="#1f1f1f" strokeWidth={10} />
        {slices.map((s, i) => {
          const len = (s.value / 100) * C;
          const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
          const dashoffset = -offset;
          offset += len;
          return <circle key={i} cx={50} cy={50} r={R} fill="none" stroke={s.color} strokeWidth={10} strokeDasharray={dasharray} strokeDashoffset={dashoffset} transform="rotate(-90 50 50)" />;
        })}
        <text x={50} y={48} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f4f4f5" fontFamily="Outfit, sans-serif">87%</text>
        <text x={50} y={62} textAnchor="middle" fontSize={6} fill="#a1a1aa" fontWeight={700} letterSpacing={1}>INBOX</text>
      </svg>
      <div className="n2__donut-legend">
        <span><span className="n2__legend-dot" style={{ background: '#3ddc97' }} />Inbox 87%</span>
        <span><span className="n2__legend-dot" style={{ background: '#ffb454' }} />Promo 9%</span>
        <span><span className="n2__legend-dot" style={{ background: '#ff5c7a' }} />Spam 4%</span>
      </div>
    </div>
  );
}

function EngagementRadar() {
  // Simple SVG pentagon radar
  const axes = ['Open', 'Reply', 'Star', 'Inbox', 'Warmth'];
  const values = [62, 18, 12, 87, 84]; // %
  const cx = 60, cy = 56, R = 38;
  const points = axes.map((_, i) => {
    const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * R,
      y: cy + Math.sin(angle) * R,
      lx: cx + Math.cos(angle) * (R + 8),
      ly: cy + Math.sin(angle) * (R + 8),
      vx: cx + Math.cos(angle) * R * (values[i]! / 100),
      vy: cy + Math.sin(angle) * R * (values[i]! / 100),
    };
  });
  const valuePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.vx.toFixed(1)} ${p.vy.toFixed(1)}`).join(' ') + ' Z';
  const axesPath = points.map((p) => `M ${cx} ${cy} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 120 110" className="n2__svg">
      {[0.33, 0.66, 1].map((r) => (
        <polygon key={r} points={points.map((p) => `${cx + (p.x - cx) * r},${cy + (p.y - cy) * r}`).join(' ')} fill="none" stroke="#1f1f1f" strokeWidth={0.7} />
      ))}
      <path d={axesPath} stroke="#1f1f1f" strokeWidth={0.5} />
      <path d={valuePath} fill="rgba(242, 101, 34,0.25)" stroke="#FF9670" strokeWidth={1.4} />
      {points.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize={6} fill="#a1a1aa" fontWeight={700}>{axes[i]}</text>
      ))}
    </svg>
  );
}

function ProviderMix() {
  return (
    <div className="n2__provider-mix">
      <div className="n2__pm-row"><span style={{ background: 'linear-gradient(135deg,#ef4444,#f59e0b)' }} />Gmail<strong>3</strong></div>
      <div className="n2__pm-row"><span style={{ background: 'linear-gradient(135deg,#FF9670,#FF8A4B)' }} />Outlook<strong>1</strong></div>
      <div className="n2__pm-row"><span style={{ background: 'linear-gradient(135deg,#FF9670,#F26522)' }} />Yahoo<strong>1</strong></div>
      <div className="n2__pm-bar">
        <span className="n2__pm-bar-seg" style={{ background: 'linear-gradient(135deg,#ef4444,#f59e0b)', width: '60%' }} />
        <span className="n2__pm-bar-seg" style={{ background: 'linear-gradient(135deg,#FF9670,#FF8A4B)', width: '20%' }} />
        <span className="n2__pm-bar-seg" style={{ background: 'linear-gradient(135deg,#FF9670,#F26522)', width: '20%' }} />
      </div>
    </div>
  );
}
