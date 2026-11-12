import { Circle, Command } from 'lucide-react';
import {
  DEMO_AGGREGATE,
  DEMO_EVENTS,
  DEMO_MAILBOXES,
  formatRelTime,
} from './demoData';

/**
 * P1 — Command Center. Bloomberg-terminal density.
 *
 * Layout:
 *   ┌─ Top ticker — 5 mailboxes always visible ───────────┐
 *   ├─ Cmd-K palette hint ────────────────────────────────┤
 *   ├─ Three-pane content                                 │
 *   │   left:  mailbox list (selected highlighted)        │
 *   │   center: stat readouts + sparkline                 │
 *   │   right: live event tape                            │
 *   └─────────────────────────────────────────────────────┘
 */
export function P1Command() {
  const selected = DEMO_MAILBOXES[0]!;

  return (
    <div className="pd-cmd">
      {/* Top ticker — five mailboxes as live tiles */}
      <div className="pd-cmd__ticker">
        {DEMO_MAILBOXES.map((m, i) => {
          const tone = m.status === 'paused' ? 'err' : m.warmth >= 80 ? 'ok' : 'warn';
          return (
            <div key={m.id} className={`pd-cmd__tick ${i === 0 ? 'pd-cmd__tick--sel' : ''}`}>
              <span className={`pd-cmd__dot pd-cmd__dot--${tone}`} />
              <span className="pd-cmd__tick-name">SDR.{String(i + 1).padStart(2, '0')}</span>
              <span className="pd-cmd__tick-warmth">{m.warmth}</span>
              <span className="pd-cmd__tick-sent">{m.sentToday}/{m.dailyTarget}</span>
            </div>
          );
        })}
        <div className="pd-cmd__live">
          <span className="pd-cmd__live-dot" />
          LIVE
        </div>
      </div>

      {/* Cmd-K hint */}
      <div className="pd-cmd__cmdk">
        <Command size={11} strokeWidth={2.4} />
        <span className="pd-cmd__cmdk-text">type to filter · press</span>
        <span className="pd-cmd__kbd">⌘K</span>
        <span className="pd-cmd__cmdk-text">for commands</span>
        <span className="pd-cmd__rolling">
          {DEMO_AGGREGATE.totalSentToday} sent · {DEMO_AGGREGATE.opensToday} opens · {DEMO_AGGREGATE.repliesToday} replies
        </span>
      </div>

      {/* Three-pane content */}
      <div className="pd-cmd__split">
        {/* Left: mailbox list */}
        <aside className="pd-cmd__pane pd-cmd__left">
          <div className="pd-cmd__pane-head">MAILBOXES · 5</div>
          {DEMO_MAILBOXES.map((m, i) => (
            <div key={m.id} className={`pd-cmd__mb ${i === 0 ? 'pd-cmd__mb--sel' : ''}`}>
              <span className={`pd-cmd__dot pd-cmd__dot--${m.status === 'paused' ? 'err' : m.warmth >= 80 ? 'ok' : 'warn'}`} />
              <span className="pd-cmd__mb-email">{m.email}</span>
              <span className="pd-cmd__mb-warmth">{m.warmth}</span>
            </div>
          ))}
        </aside>

        {/* Center: stat readouts */}
        <div className="pd-cmd__pane pd-cmd__center">
          <div className="pd-cmd__pane-head">{selected.email}</div>
          <div className="pd-cmd__kpi-grid">
            {[
              { lbl: 'WARMTH', val: selected.warmth, sfx: '/100' },
              { lbl: 'DAY', val: selected.day, sfx: '/30' },
              { lbl: 'SENT', val: selected.sentToday, sfx: `/${selected.dailyTarget}` },
              { lbl: 'PROVIDER', val: 'GML' },
              { lbl: 'SPF', val: selected.spfOk ? 'OK' : 'FAIL' },
              { lbl: 'DKIM', val: selected.dkimOk ? 'OK' : 'FAIL' },
              { lbl: 'DMARC', val: selected.dmarcOk ? 'OK' : 'FAIL' },
              { lbl: 'STATUS', val: selected.status.toUpperCase() },
            ].map((k) => (
              <div key={k.lbl} className="pd-cmd__kpi">
                <span className="pd-cmd__kpi-lbl">{k.lbl}</span>
                <span className="pd-cmd__kpi-val">
                  {k.val}
                  {k.sfx && <span className="pd-cmd__kpi-sfx">{k.sfx}</span>}
                </span>
              </div>
            ))}
          </div>
          {/* 14-day warmth sparkline as ASCII-ish bars */}
          <div className="pd-cmd__spark">
            <span className="pd-cmd__spark-lbl">14D WARMTH</span>
            <div className="pd-cmd__spark-bars">
              {selected.spark.map((v, i) => (
                <span key={i} style={{ height: `${v}%` }} className="pd-cmd__spark-bar" />
              ))}
            </div>
            <span className="pd-cmd__spark-end">{selected.warmth}</span>
          </div>
        </div>

        {/* Right: live event tape */}
        <aside className="pd-cmd__pane pd-cmd__right">
          <div className="pd-cmd__pane-head">
            <Circle size={6} fill="currentColor" /> LIVE EVENTS · {DEMO_EVENTS.length}
          </div>
          {DEMO_EVENTS.map((e) => (
            <div key={e.id} className="pd-cmd__evt">
              <span className="pd-cmd__evt-time">{formatRelTime(e.ts)}</span>
              <span className={`pd-cmd__evt-act pd-cmd__evt-act--${e.action}`}>
                {e.action.slice(0, 4).toUpperCase()}
              </span>
              <span className="pd-cmd__evt-peer">{e.peer}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
