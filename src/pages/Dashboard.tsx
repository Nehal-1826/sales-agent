import { useCallback, useEffect, useState } from 'react';
import {
  approveDraft,
  getAutopilot,
  getDrafts,
  getLeads,
  getPipelineStatus,
  getPotential,
  getReplies,
  rejectDraft,
  sendDraft,
  updateDraft,
} from '../lib/api';
import { CrmBoard } from '../components/CrmBoard';
import { Chip, PageHeader, Spinner, StatusDot } from '../components/ui';
import { IconChat, IconSend } from '../components/icons';
import type { EmailDraft, Lead, PageKey, PipelineTab, Potential, Reply } from '../lib/types';

/**
 * DASHBOARD — the command center:
 *   today's numbers · MAIL DRAFTS & APPROVALS (the human gate) ·
 *   CRM overview · system status.
 * Everything operational (agents, leads table, reports, chat) lives in Pipeline.
 */
export function Dashboard({ onNavigate, live }: { onNavigate: (p: PageKey) => void; live: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [potential, setPotential] = useState<Potential[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([getLeads(), getPotential(), getReplies(), getDrafts()]).then(([l, p, r, d]) => {
      setLeads(l);
      setPotential(p);
      setReplies(r);
      setDrafts(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const pending = drafts.filter((d) => d.status === 'Draft');
  const sent = drafts.filter((d) => d.status === 'Sent');
  const failed = drafts.filter((d) => d.status === 'Failed');

  if (loading) return <Spinner label="Loading your workspace…" />;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Everything that needs your attention — approvals first, then the numbers behind the pipeline."
        actions={
          <button className="btn btn-primary" onClick={() => onNavigate('pipeline')}>
            Open Pipeline →
          </button>
        }
      />

      {/* ---- today's numbers ---- */}
      <div className="stat-row">
        <StatCard label="Leads" value={leads.length} note="discovered by Search" />
        <StatCard label="Potential" value={potential.length} note="opportunities identified" />
        <StatCard label="Awaiting approval" value={pending.length} note="cold-email drafts" highlight={pending.length > 0} />
        <StatCard label="Sent" value={sent.length} note={failed.length ? `${failed.length} failed — retry in CRM` : 'via SMTP'} />
        <StatCard label="Replies" value={replies.length} note="handled by Responder" />
      </div>

      {/* ---- mail drafts & approvals ---- */}
      <DraftsApproval drafts={pending} failed={failed} onDone={reload} />

      {/* ---- CRM overview ---- */}
      <section className="panel">
        <div className="panel-head">
          <span className="section-label">CRM OVERVIEW</span>
          <button className="link-btn" onClick={() => jumpToPipelineTab(onNavigate, 'crm')}>
            Open full CRM →
          </button>
        </div>
        <CrmBoard compact refreshToken={drafts.length + leads.length} />
      </section>

      {/* ---- system / responder ---- */}
      <div className="dash-two-col">
        <SystemPanel live={live} onNavigate={onNavigate} />
        <section className="panel">
          <div className="panel-head">
            <span className="section-label">RESPONDER · CHAT</span>
            <button className="link-btn" onClick={() => jumpToPipelineTab(onNavigate, 'chat')}>
              Open chat →
            </button>
          </div>
          <div className="chat-preview">
            <div className="chat-preview-input" onClick={() => jumpToPipelineTab(onNavigate, 'chat')}>
              <span>
                <IconChat size={13} /> Message the Responder…
              </span>
              <IconSend size={15} />
            </div>
          </div>
          <p className="panel-note">
            The chatbot replies to inbound lead questions — full conversation history lives in Pipeline → Chat.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Navigate to the Pipeline page with a specific tab pre-selected (via hash — PipelinePage reads it). */
function jumpToPipelineTab(onNavigate: (p: PageKey) => void, tab: PipelineTab) {
  window.location.hash = `pipeline/${tab}`;
  onNavigate('pipeline');
}

function StatCard({
  label,
  value,
  note,
  highlight = false,
}: {
  label: string;
  value: number;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div className={`stat-card${highlight ? ' highlight' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      <small className="stat-note">{note}</small>
    </div>
  );
}

/** The human gate: approve & send, edit, or reject the Copywright's drafts. */
function DraftsApproval({
  drafts,
  failed,
  onDone,
}: {
  drafts: EmailDraft[];
  failed: EmailDraft[];
  onDone: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTo, setEditTo] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [msg, setMsg] = useState('');

  const act = async (id: string, fn: (id: string) => Promise<unknown>, ok: string) => {
    setBusyId(id);
    const res = (await fn(id)) as EmailDraft | null;
    setBusyId(null);
    setMsg(res ? ok : 'Backend not reachable — start Django and try again.');
    onDone();
  };

  const startEdit = (d: EmailDraft) => {
    setEditing(d.id);
    setEditTo(d.toEmail || '');
    setEditSubject(d.subject);
    setEditBody(d.body);
    setMsg('');
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    const res = await updateDraft(id, { toEmail: editTo, subject: editSubject, body: editBody });
    setBusyId(null);
    if (res) {
      setEditing(null);
      setMsg('Draft updated ✓');
    } else {
      setMsg('Save failed — is the backend running?');
    }
    onDone();
  };

  const queue = [...drafts, ...failed];

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="section-label">MAIL DRAFTS &amp; APPROVALS</span>
        {queue.length > 0 ? (
          <Chip tone="accent">{queue.length} awaiting you</Chip>
        ) : (
          <Chip tone="success">All clear</Chip>
        )}
      </div>
      <p className="panel-note" style={{ margin: '0 0 12px' }}>
        Cold emails drafted by the Copywright agent. Nothing is sent until you approve it here
        (or in Pipeline → CRM → Outreach).
      </p>

      {msg && <p className="inline-msg" style={{ margin: '0 0 10px' }}>{msg}</p>}

      {queue.length === 0 ? (
        <p className="inline-msg">
          No drafts waiting. Run a cycle from the Pipeline page to discover leads and draft new outreach.
        </p>
      ) : (
        <div className="approval-list">
          {queue.map((d) => (
            <article className={`approval-card${d.status === 'Failed' ? ' failed' : ''}`} key={d.id}>
              <div className="approval-main">
                <div className="approval-top">
                  <strong>{d.company}</strong>
                  {d.status === 'Failed' ? <Chip tone="warn">Failed — retry</Chip> : <Chip tone="accent">Draft</Chip>}
                </div>
                <span className="approval-to">To: {d.toEmail || <em>no email found — add one below</em>}</span>
                {editing === d.id ? (
                  <div className="approval-edit">
                    <input value={editTo} onChange={(e) => setEditTo(e.target.value)} placeholder="Recipient email" />
                    <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Subject" />
                    <textarea rows={6} value={editBody} onChange={(e) => setEditBody(e.target.value)} placeholder="Email body" />
                  </div>
                ) : (
                  <>
                    <span className="approval-subject">{d.subject}</span>
                    <span className="approval-body">{d.body.length > 220 ? `${d.body.slice(0, 220)}…` : d.body}</span>
                    {d.error && <span className="approval-error">{d.error}</span>}
                  </>
                )}
              </div>
              <div className="approval-actions">
                {editing === d.id ? (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={busyId === d.id} onClick={() => saveEdit(d.id)}>
                      Save
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {d.status === 'Failed' ? (
                      <button className="btn btn-primary btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, sendDraft, 'Sent ✓')}>
                        {busyId === d.id ? 'Sending…' : 'Retry send'}
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, approveDraft, 'Approved & sent ✓')}>
                        {busyId === d.id ? 'Sending…' : 'Approve & send'}
                      </button>
                    )}
                    <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => startEdit(d)}>
                      Edit
                    </button>
                    <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, rejectDraft, 'Rejected')}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Live system status: backend, orchestrator cadence, autopilot. */
function SystemPanel({ live, onNavigate }: { live: boolean; onNavigate: (p: PageKey) => void }) {
  const [status, setStatus] = useState<{
    running: boolean;
    frequency: string;
    nextRunInMinutes: number | null;
  } | null>(null);
  const [autopilot, setAutopilot] = useState<{
    enabled: boolean;
    sentToday: number;
    dailyLimit: number;
  } | null>(null);

  useEffect(() => {
    if (!live) return;
    getPipelineStatus().then((s) => {
      if (s) setStatus({ running: s.running, frequency: s.frequency, nextRunInMinutes: s.nextRunInMinutes });
    });
    getAutopilot().then((a) => {
      if (a) setAutopilot({ enabled: a.enabled, sentToday: a.sentToday, dailyLimit: a.dailyLimit });
    });
  }, [live]);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="section-label">SYSTEM</span>
        <button className="link-btn" onClick={() => onNavigate('pipeline')}>
          Orchestrator →
        </button>
      </div>
      <div className="system-rows">
        <div className="system-row">
          <StatusDot tone={live ? 'success' : 'gray'} pulse={live} />
          <span>Backend</span>
          <strong>{live ? 'Live · Django' : 'Offline · mock data'}</strong>
        </div>
        <div className="system-row">
          <StatusDot tone={status ? (status.running ? 'success' : 'gray') : 'gray'} />
          <span>Pipeline</span>
          <strong>
            {!live
              ? '—'
              : !status
                ? 'Checking…'
                : status.running
                  ? 'Running a cycle'
                  : status.nextRunInMinutes != null
                    ? `Idle · next in ${status.nextRunInMinutes} min`
                    : 'Idle · manual mode'}
          </strong>
        </div>
        <div className="system-row">
          <StatusDot tone={status ? 'success' : 'gray'} />
          <span>Cadence</span>
          <strong>{live ? (status ? status.frequency : '—') : '—'}</strong>
        </div>
        <div className="system-row">
          <StatusDot tone={autopilot?.enabled ? 'success' : 'gray'} />
          <span>AI Autopilot</span>
          <strong>
            {!live
              ? '—'
              : !autopilot
                ? 'Checking…'
                : autopilot.enabled
                  ? `On · ${autopilot.sentToday}/${autopilot.dailyLimit} sent today`
                  : 'Off — manual runs'}
          </strong>
        </div>
      </div>
    </section>
  );
}
