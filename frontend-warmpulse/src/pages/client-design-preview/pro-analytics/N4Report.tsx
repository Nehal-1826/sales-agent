import { motion } from 'framer-motion';
import { BarChart3, Inbox, ScrollText, Sparkles, Target } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { MiniSpark, toneFor } from '../pro-mailboxes/shared';

/**
 * N4 — Stacked Report. Vertical scroll narrative.
 * Numbered sections, each with hero stat + context paragraph + visual.
 */
export function N4Report() {
  return (
    <div className="n4r">
      <header className="n4r__head">
        <span className="n4r-eyebrow"><ScrollText size={11} strokeWidth={2.4} />Workspace report</span>
        <h2 className="n4r__title">Analytics, told as a story</h2>
        <p className="n4r__sub">
          Four chapters from your warmup engine. Each section reads top-down with the
          hero number on the left and the supporting visual on the right.
        </p>
      </header>

      {/* Section 01 — Overall warmth */}
      <Section
        no="01"
        Icon={Sparkles}
        title="Sender reputation is climbing"
        body={
          <>
            Workspace warmth averages <strong>{DEMO_AGGREGATE.avgWarmth}/100</strong> across
            {' '}{DEMO_MAILBOXES.length} mailboxes — up 12 points over the last 14 days.
            Three of five mailboxes are above the inbox-safe threshold (≥80) and ready
            for ramped outbound. The peer network is producing the engagement signal
            inbox providers reward.
          </>
        }
        heroNum={DEMO_AGGREGATE.avgWarmth}
        heroLbl="/100"
        heroSub="avg warmth"
        side={
          <div className="n4r__warmth-bars">
            {DEMO_MAILBOXES.map((m) => (
              <div key={m.id} className="n4r__warmth-bar">
                <span className="n4r__warmth-bar-lbl">{m.email.split('@')[0]}</span>
                <span className="n4r__warmth-bar-track">
                  <span className={`n4r__warmth-bar-fill n4r__warmth-bar-fill--${toneFor(m)}`} style={{ width: `${m.warmth}%` }} />
                </span>
                <span className="n4r__warmth-bar-val">{m.warmth}</span>
              </div>
            ))}
          </div>
        }
      />

      {/* Section 02 — Volume */}
      <Section
        no="02"
        Icon={BarChart3}
        title="Daily volume is compounding"
        body={
          <>
            The engine sent <strong>{DEMO_AGGREGATE.totalSentToday} peer messages today</strong>{' '}
            against a target of <strong>{DEMO_AGGREGATE.totalTarget}</strong>. Volume is
            up <strong>18% week-over-week</strong> as mailboxes complete their ramp
            ladders. Two mailboxes are still inside the first week of warmup and will
            scale up as they progress.
          </>
        }
        heroNum={DEMO_AGGREGATE.totalSentToday}
        heroSub="sent today"
        heroLbl={`/ ${DEMO_AGGREGATE.totalTarget}`}
        side={
          <div className="n4r__spark-wall">
            {DEMO_MAILBOXES.map((m) => (
              <div key={m.id} className="n4r__spark-tile">
                <span className="n4r__spark-name">{m.email.split('@')[0]}</span>
                <MiniSpark data={m.spark} tone={toneFor(m)} width={140} height={40} />
                <span className="n4r__spark-val">{m.sentToday}<span className="n4r__spark-dim">/{m.dailyTarget}</span></span>
              </div>
            ))}
          </div>
        }
      />

      {/* Section 03 — Engagement */}
      <Section
        no="03"
        Icon={Target}
        title="Engagement is strong"
        body={
          <>
            Peer mailboxes opened <strong>{DEMO_AGGREGATE.opensToday}</strong> of{' '}
            <strong>{DEMO_AGGREGATE.totalSentToday}</strong> messages (
            <strong>{Math.round((DEMO_AGGREGATE.opensToday / DEMO_AGGREGATE.totalSentToday) * 100)}%</strong>
            {' '}open rate) and replied to <strong>{DEMO_AGGREGATE.repliesToday}</strong>
            {' '}(<strong>{Math.round((DEMO_AGGREGATE.repliesToday / DEMO_AGGREGATE.totalSentToday) * 100)}%</strong>{' '}
            reply rate). Inbox providers heavily weight these signals.
          </>
        }
        heroNum={Math.round((DEMO_AGGREGATE.opensToday / DEMO_AGGREGATE.totalSentToday) * 100)}
        heroLbl="%"
        heroSub="open rate"
        side={
          <div className="n4r__eng-rows">
            <EngRow lbl="Open rate" pct={62} num={DEMO_AGGREGATE.opensToday} tone="success" />
            <EngRow lbl="Reply rate" pct={18} num={DEMO_AGGREGATE.repliesToday} tone="warning" />
            <EngRow lbl="Star rate" pct={4} num={3} tone="violet" />
            <EngRow lbl="Spam rescue" pct={6} num={DEMO_AGGREGATE.spamRescuedToday} tone="danger" />
          </div>
        }
      />

      {/* Section 04 — Placement */}
      <Section
        no="04"
        Icon={Inbox}
        title="Inbox placement holds"
        body={
          <>
            <strong>87%</strong> of warmup mail lands directly in the recipient inbox.{' '}
            <strong>9%</strong> goes to promotions and <strong>4%</strong> to spam — the
            spam-rescue routine pulls those back. Bounce rate sits at <strong>0.4%</strong>,
            well inside the ESP-safe band.
          </>
        }
        heroNum={87}
        heroLbl="%"
        heroSub="inbox placement"
        side={
          <div className="n4r__placement">
            <PlacementBar lbl="Inbox" pct={87} tone="success" />
            <PlacementBar lbl="Promotions" pct={9} tone="warning" />
            <PlacementBar lbl="Spam" pct={4} tone="danger" />
            <div className="n4r__placement-note">
              <span>Recovered from spam → inbox</span>
              <strong>{DEMO_AGGREGATE.spamRescuedToday}</strong>
            </div>
          </div>
        }
      />
    </div>
  );
}

function Section({
  no, Icon, title, body, heroNum, heroLbl, heroSub, side,
}: {
  no: string;
  Icon: typeof Sparkles;
  title: string;
  body: React.ReactNode;
  heroNum: number;
  heroLbl: string;
  heroSub: string;
  side: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4 }}
      className="n4r__section"
    >
      <header className="n4r__section-head">
        <span className="n4r__section-no">{no}</span>
        <span className="n4r__section-rule" />
        <span className="n4r__section-eyebrow"><Icon size={11} strokeWidth={2.4} /></span>
      </header>
      <div className="n4r__section-body">
        <div className="n4r__section-left">
          <h3 className="n4r__section-title">{title}</h3>
          <p className="n4r__section-text">{body}</p>
          <div className="n4r__section-hero">
            <span className="n4r__hero-num">{heroNum}</span>
            <span className="n4r__hero-lbl">{heroLbl}</span>
            <span className="n4r__hero-sub">{heroSub}</span>
          </div>
        </div>
        <div className="n4r__section-right">{side}</div>
      </div>
    </motion.section>
  );
}

function EngRow({ lbl, pct, num, tone }: { lbl: string; pct: number; num: number; tone: string }) {
  return (
    <div className="n4r__eng-row">
      <span className="n4r__eng-lbl">{lbl}</span>
      <span className="n4r__eng-track">
        <span className={`n4r__eng-fill n4r__eng-fill--${tone}`} style={{ width: `${pct * 5}%` }} />
      </span>
      <span className="n4r__eng-val"><strong>{pct}%</strong> <span className="n4r__eng-dim">{num}</span></span>
    </div>
  );
}

function PlacementBar({ lbl, pct, tone }: { lbl: string; pct: number; tone: string }) {
  return (
    <div className="n4r__place-row">
      <span className="n4r__place-lbl">{lbl}</span>
      <span className="n4r__place-track">
        <span className={`n4r__place-fill n4r__place-fill--${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="n4r__place-val">{pct}%</span>
    </div>
  );
}
