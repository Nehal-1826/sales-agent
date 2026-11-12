import {
  DEMO_AGGREGATE,
  DEMO_MAILBOXES,
  DEMO_SENDS_30D,
} from './demoData';

/**
 * P3 — Grid Ops. Datadog/Grafana modular panels.
 *
 * Layout:
 *   ┌─ System bar (5 LEDs + counts) ─────────────────────┐
 *   ├─ 6-panel grid (3×2)                                │
 *   │  [warmth bars]  [sends 30d area]  [opens spark]    │
 *   │  [mailboxes table]    [DNS matrix]   [perf radial] │
 *   └────────────────────────────────────────────────────┘
 */
export function P3GridOps() {
  return (
    <div className="pd-ops">
      {/* Top system bar */}
      <div className="pd-ops__sysbar">
        <div className="pd-ops__sys-leds">
          {DEMO_MAILBOXES.map((m) => {
            const tone = m.status === 'paused' ? 'err' : m.warmth >= 80 ? 'ok' : 'warn';
            return <span key={m.id} className={`pd-ops__led pd-ops__led--${tone}`} />;
          })}
        </div>
        <span className="pd-ops__sys-label">
          {DEMO_AGGREGATE.activeCount + DEMO_AGGREGATE.warmupCount}/{DEMO_MAILBOXES.length} systems · all green
        </span>
        <div className="pd-ops__sys-stats">
          <span><b>{DEMO_AGGREGATE.totalSentToday}</b> sent</span>
          <span><b>{DEMO_AGGREGATE.opensToday}</b> opens</span>
          <span><b>{DEMO_AGGREGATE.repliesToday}</b> replies</span>
          <span className="pd-ops__sys-bounce"><b>{DEMO_AGGREGATE.bouncesToday}</b> bounces</span>
        </div>
      </div>

      {/* 6-panel grid */}
      <div className="pd-ops__grid">
        {/* Panel 1: per-mailbox warmth bars */}
        <section className="pd-ops__panel pd-ops__panel--span-2">
          <header className="pd-ops__panel-head">
            <span className="pd-ops__panel-title">WARMTH · PER MAILBOX</span>
            <span className="pd-ops__panel-meta">live</span>
          </header>
          <div className="pd-ops__warmth-bars">
            {DEMO_MAILBOXES.map((m) => (
              <div key={m.id} className="pd-ops__wb-row">
                <span className="pd-ops__wb-name">{m.email.split('@')[0]}</span>
                <div className="pd-ops__wb-track">
                  <span
                    className={`pd-ops__wb-fill pd-ops__wb-fill--${m.warmth >= 80 ? 'ok' : m.warmth >= 60 ? 'warn' : 'err'}`}
                    style={{ width: `${m.warmth}%` }}
                  />
                </div>
                <span className="pd-ops__wb-val">{m.warmth}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 2: 30-day sends area chart */}
        <section className="pd-ops__panel">
          <header className="pd-ops__panel-head">
            <span className="pd-ops__panel-title">SENDS · 30D</span>
            <span className="pd-ops__panel-meta">+18% wow</span>
          </header>
          <div className="pd-ops__chart">
            <SendsAreaChart />
          </div>
        </section>

        {/* Panel 3: opens sparkline */}
        <section className="pd-ops__panel">
          <header className="pd-ops__panel-head">
            <span className="pd-ops__panel-title">OPENS · 24H</span>
            <span className="pd-ops__panel-meta pd-ops__panel-meta--pink">live</span>
          </header>
          <div className="pd-ops__chart">
            <OpensSpark />
          </div>
        </section>

        {/* Panel 4: DNS matrix */}
        <section className="pd-ops__panel">
          <header className="pd-ops__panel-head">
            <span className="pd-ops__panel-title">DNS HEALTH</span>
            <span className="pd-ops__panel-meta">5 × 3</span>
          </header>
          <div className="pd-ops__dns">
            <div className="pd-ops__dns-head">
              <span />
              <span>SPF</span>
              <span>DKIM</span>
              <span>DMARC</span>
            </div>
            {DEMO_MAILBOXES.map((m) => (
              <div key={m.id} className="pd-ops__dns-row">
                <span className="pd-ops__dns-name">{m.email.split('@')[0]}</span>
                <span className={`pd-ops__dns-cell pd-ops__dns-cell--${m.spfOk ? 'ok' : 'err'}`} />
                <span className={`pd-ops__dns-cell pd-ops__dns-cell--${m.dkimOk ? 'ok' : 'err'}`} />
                <span className={`pd-ops__dns-cell pd-ops__dns-cell--${m.dmarcOk ? 'ok' : 'err'}`} />
              </div>
            ))}
          </div>
        </section>

        {/* Panel 5: provider mix */}
        <section className="pd-ops__panel">
          <header className="pd-ops__panel-head">
            <span className="pd-ops__panel-title">PROVIDER MIX</span>
            <span className="pd-ops__panel-meta">5 boxes</span>
          </header>
          <div className="pd-ops__chart">
            <ProviderDonut />
          </div>
        </section>
      </div>
    </div>
  );
}

/* Hand-rolled SVG charts — Grafana-y, minimal */

function SendsAreaChart() {
  const W = 280, H = 100, PAD = 4;
  const max = Math.max(...DEMO_SENDS_30D);
  const step = (W - PAD * 2) / (DEMO_SENDS_30D.length - 1);
  const pts = DEMO_SENDS_30D.map((v, i) => ({
    x: PAD + i * step,
    y: H - PAD - (v / max) * (H - PAD * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1]!.x} ${H - PAD} L ${pts[0]!.x} ${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pd-ops__svg">
      <defs>
        <linearGradient id="pd-ops-grad-cyan" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(6,182,212)" stopOpacity={0.4} />
          <stop offset="100%" stopColor="rgb(6,182,212)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#pd-ops-grad-cyan)" />
      <path d={path} fill="none" stroke="rgb(6,182,212)" strokeWidth={1.4} />
    </svg>
  );
}

function OpensSpark() {
  const data = [22, 28, 25, 30, 35, 33, 38, 42, 40, 45, 48, 52];
  const W = 280, H = 100, PAD = 4, gap = 3;
  const max = Math.max(...data);
  const bw = (W - PAD * 2 - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pd-ops__svg">
      {data.map((v, i) => {
        const h = (v / max) * (H - PAD * 2);
        const x = PAD + i * (bw + gap);
        const y = H - PAD - h;
        return <rect key={i} x={x} y={y} width={bw} height={h} rx={1.5} fill="rgb(236,72,153)" opacity={0.88} />;
      })}
    </svg>
  );
}

function ProviderDonut() {
  // 3 gmail, 1 outlook, 1 yahoo
  const slices = [
    { value: 3, color: 'rgb(6,182,212)' },
    { value: 1, color: 'rgb(255, 150, 112)' },
    { value: 1, color: 'rgb(250,204,21)' },
  ];
  const total = 5, R = 32, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="pd-ops__svg">
      <circle cx={50} cy={50} r={R} fill="none" stroke="rgb(42,45,51)" strokeWidth={10} />
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle
            key={i}
            cx={50} cy={50} r={R} fill="none"
            stroke={s.color} strokeWidth={10}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 50 50)"
          />
        );
      })}
      <text x={50} y={48} textAnchor="middle" fontSize={16} fontWeight={700} fill="white" fontFamily="JetBrains Mono">
        5
      </text>
      <text x={50} y={62} textAnchor="middle" fontSize={6} fill="rgb(110,114,128)" fontWeight={700} letterSpacing={1}>
        TOTAL
      </text>
    </svg>
  );
}
