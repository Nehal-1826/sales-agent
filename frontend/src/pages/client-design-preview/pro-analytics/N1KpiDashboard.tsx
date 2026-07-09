import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, BarChart3, Inbox, Mail, MailOpen, Reply, Sparkles, TrendingDown, TrendingUp, ShieldAlert } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, DEMO_SENDS_30D } from '../pro-dashboards/demoData';
import { MiniSpark, ProviderSwatch, toneFor } from '../pro-mailboxes/shared';

/**
 * N1 — KPI Dashboard. Executive Bloomberg-style.
 * Top: 8 KPI tiles (warmth, sent, opens, replies, bounce, placement, rescued, mailboxes).
 * Middle: combined warmth + sends time-series.
 * Bottom: per-mailbox comparison table.
 */
export function N1KpiDashboard() {
  const openRate = Math.round((DEMO_AGGREGATE.opensToday / DEMO_AGGREGATE.totalSentToday) * 100);
  const replyRate = Math.round((DEMO_AGGREGATE.repliesToday / DEMO_AGGREGATE.totalSentToday) * 100);
  const bounceRate = Math.round((DEMO_AGGREGATE.bouncesToday / DEMO_AGGREGATE.totalSentToday) * 100 * 10) / 10;
  const inboxPct = 87;

  const kpis: Array<{ label: string; value: string; tone: string; Icon: typeof Mail; delta: number; deltaLbl: string }> = [
    { label: 'Avg warmth', value: `${DEMO_AGGREGATE.avgWarmth}`, tone: 'violet-soft', Icon: Sparkles, delta: 4, deltaLbl: 'wk' },
    { label: 'Sent today', value: `${DEMO_AGGREGATE.totalSentToday}`, tone: 'violet-soft', Icon: Mail, delta: 18, deltaLbl: 'wow' },
    { label: 'Open rate', value: `${openRate}%`, tone: 'success', Icon: MailOpen, delta: 3, deltaLbl: 'pts' },
    { label: 'Reply rate', value: `${replyRate}%`, tone: 'warning', Icon: Reply, delta: 1, deltaLbl: 'pts' },
    { label: 'Inbox placement', value: `${inboxPct}%`, tone: 'success', Icon: Inbox, delta: 2, deltaLbl: 'pts' },
    { label: 'Bounce rate', value: `${bounceRate}%`, tone: 'success', Icon: TrendingDown, delta: -0.4, deltaLbl: 'pts' },
    { label: 'Spam rescued', value: `${DEMO_AGGREGATE.spamRescuedToday}`, tone: 'danger', Icon: ShieldAlert, delta: 1, deltaLbl: 'd' },
    { label: 'Mailboxes', value: `${DEMO_AGGREGATE.activeCount}/${DEMO_MAILBOXES.length}`, tone: 'violet', Icon: BarChart3, delta: 0, deltaLbl: '' },
  ];

  return (
    <div className="n1">
      {/* KPI grid */}
      <section className="n1__kpis">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            className={`n1__kpi n1__kpi--${k.tone}`}
          >
            <span className={`n1__kpi-icon n1__kpi-icon--${k.tone}`}>
              <k.Icon size={13} strokeWidth={2.4} />
            </span>
            <span className="n1__kpi-label">{k.label}</span>
            <span className="n1__kpi-value">{k.value}</span>
            {k.delta !== 0 && (
              <span className={`n1__kpi-delta n1__kpi-delta--${k.delta > 0 ? 'up' : 'down'}`}>
                {k.delta > 0 ? <ArrowUpRight size={10} strokeWidth={2.6} /> : <ArrowDownRight size={10} strokeWidth={2.6} />}
                {Math.abs(k.delta)}{k.deltaLbl}
              </span>
            )}
          </motion.div>
        ))}
      </section>

      {/* Big time-series chart */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="n1__chart"
      >
        <header className="n1-panel-head">
          <div>
            <span className="n1-panel-eyebrow">
              <TrendingUp size={11} strokeWidth={2.4} />
              30-day trend
            </span>
            <h3 className="n1-panel-title">Workspace warmth & send volume</h3>
          </div>
          <div className="n1__chart-legend">
            <span className="n1__legend-item"><span className="n1__legend-dot n1__legend-dot--violet" />Sends</span>
            <span className="n1__legend-item"><span className="n1__legend-dot n1__legend-dot--accent" />Warmth (avg)</span>
          </div>
        </header>
        <TrendChart />
      </motion.section>

      {/* Per-mailbox comparison */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="n1__compare"
      >
        <header className="n1-panel-head">
          <span className="n1-panel-eyebrow">Per-mailbox</span>
          <h3 className="n1-panel-title">Comparison · 5 mailboxes</h3>
        </header>
        <div className="n1__compare-table">
          <div className="n1__compare-th">
            <span>Mailbox</span>
            <span>Warmth</span>
            <span>14d trend</span>
            <span>Sent today</span>
            <span>Open %</span>
            <span>Day</span>
            <span>Status</span>
          </div>
          {DEMO_MAILBOXES.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.25 + i * 0.03 }}
              className="n1__compare-row"
            >
              <span className="n1__compare-mb">
                <ProviderSwatch provider={m.provider} size={22} />
                <span>{m.email.split('@')[0]}</span>
              </span>
              <span className="n1__compare-warmth">
                <span className={`n1__compare-warmth-bar n1__compare-warmth-bar--${toneFor(m)}`} style={{ width: `${m.warmth}%` }} />
                <strong>{m.warmth}</strong>
              </span>
              <MiniSpark data={m.spark} tone={toneFor(m)} width={80} height={20} />
              <span className="n1__compare-num">{m.sentToday}<span className="n1__compare-dim">/{m.dailyTarget}</span></span>
              <span className="n1__compare-num">{40 + ((i * 7) % 25)}%</span>
              <span className="n1__compare-num">{m.day}<span className="n1__compare-dim">/30</span></span>
              <span className={`n1__compare-status n1__compare-status--${toneFor(m)}`}>
                {m.status === 'paused' ? 'Paused' : m.status === 'warmup' ? 'Warming' : 'Active'}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

function TrendChart() {
  const data = DEMO_SENDS_30D;
  const warmthData = data.map((_, i) => 50 + Math.round(i * 1.5));
  const W = 800, H = 220, PAD = 24;
  const maxSend = Math.max(...data);
  const step = (W - PAD * 2) / (data.length - 1);

  const sendPts = data.map((v, i) => ({
    x: PAD + i * step,
    y: H - PAD - (v / maxSend) * (H - PAD * 2),
  }));
  const sendPath = sendPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const sendArea = `${sendPath} L ${sendPts[sendPts.length - 1]!.x} ${H - PAD} L ${sendPts[0]!.x} ${H - PAD} Z`;

  const warmPts = warmthData.map((v, i) => ({
    x: PAD + i * step,
    y: H - PAD - (v / 100) * (H - PAD * 2),
  }));
  const warmPath = warmPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="n1__chart-svg">
      <defs>
        <linearGradient id="n1-grad-violet" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1={PAD} x2={W - PAD} y1={H - PAD - p * (H - PAD * 2)} y2={H - PAD - p * (H - PAD * 2)} stroke="#1f1f1f" strokeDasharray="3 6" />
      ))}
      <path d={sendArea} fill="url(#n1-grad-violet)" />
      <path d={sendPath} fill="none" stroke="#F26522" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={warmPath} fill="none" stroke="#FF9670" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
      <circle cx={sendPts[sendPts.length - 1]!.x} cy={sendPts[sendPts.length - 1]!.y} r={3} fill="#F26522" />
      <circle cx={warmPts[warmPts.length - 1]!.x} cy={warmPts[warmPts.length - 1]!.y} r={3} fill="#FF9670" />
    </svg>
  );
}
