import { useCallback, useEffect, useState } from 'react';
import { approveDraft, getDrafts, getLeads, getPotential, getReplies, rejectDraft, sendDraft, updateDraft } from '../lib/api';
import type { EmailDraft, Lead, Potential, Reply } from '../lib/types';
import { Chip, Spinner } from './ui';

/**
 * CRM — the areas from the notes:
 *   LEADS (discovered by Search) · POTENTIAL (opportunities)
 *   OUTREACH (cold-email drafts → human approve → sent) · REPLY (handled by Responder)
 */
export function CrmBoard({ compact = false, refreshToken = 0 }: { compact?: boolean; refreshToken?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [potential, setPotential] = useState<Potential[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editToEmail, setEditToEmail] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
  }, [reload, refreshToken]);

  const limit = compact ? 3 : Infinity;

  /* ---- outreach actions ---- */

  const act = async (id: string, fn: (id: string) => Promise<unknown>) => {
    setBusyId(id);
    await fn(id);
    setBusyId(null);
    reload();
  };

  const startEdit = (d: EmailDraft) => {
    setEditing(d.id);
    setEditToEmail(d.toEmail || '');
    setEditSubject(d.subject);
    setEditBody(d.body);
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    await updateDraft(id, { toEmail: editToEmail, subject: editSubject, body: editBody });
    setEditing(null);
    setBusyId(null);
    reload();
  };

  const draftChip = (d: EmailDraft) => {
    if (d.status === 'Sent') return <Chip tone="success">{d.status}{d.sentVia === 'console' ? ' (console)' : ''}</Chip>;
    if (d.status === 'Failed') return <Chip tone="warn">Failed</Chip>;
    if (d.status === 'Rejected') return <Chip tone="neutral">Rejected</Chip>;
    if (d.status === 'Approved') return <Chip tone="accent">Approved</Chip>;
    return <Chip tone="accent">Draft</Chip>;
  };

  if (loading) return <Spinner label="Loading CRM data…" />;

  return (
    <div className="crm-board">
      {/* LEADS */}
      <section className="crm-col">
        <header className="crm-col-head">
          <h3>LEADS</h3>
          <span className="count">{leads.length}</span>
        </header>
        <p className="crm-col-sub">Companies discovered by the Search agent</p>
        <div className="crm-cards">
          {leads.slice(0, limit).map((lead) => (
            <article className="crm-card" key={lead.id}>
              <div className="crm-card-top">
                <strong>{lead.company}</strong>
                <span className="score">{lead.score}</span>
              </div>
              <span className="crm-line">
                {lead.industry} · {lead.website || 'no website'}
              </span>
              {lead.description && (
                <span className="crm-line" title={lead.description}>
                  {lead.description}
                </span>
              )}
              <div className="crm-card-foot" style={{ gap: 6 }}>
                <Chip tone={lead.hasWebsite ? 'neutral' : 'warn'}>
                  {lead.hasWebsite ? 'Website' : 'No website'}
                </Chip>
                {lead.findings.length > 0 && <small>{lead.findings.length} flaw(s)</small>}
              </div>
              {lead.contactEmail && (
                <div className="crm-card-foot">
                  <small>✉ {lead.contactEmail}</small>
                </div>
              )}
              {lead.contactPhone && (
                <div className="crm-card-foot">
                  <small>☎ {lead.contactPhone}</small>
                </div>
              )}
              <div className="crm-card-foot">
                <small>{lead.source}</small>
                <small>{lead.discovered}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* POTENTIAL */}
      <section className="crm-col">
        <header className="crm-col-head">
          <h3>POTENTIAL</h3>
          <span className="count">{potential.length}</span>
        </header>
        <p className="crm-col-sub">Opportunities identified by the system</p>
        <div className="crm-cards">
          {potential.slice(0, limit).map((p) => (
            <article className="crm-card" key={p.id}>
              <div className="crm-card-top">
                <strong>{p.company}</strong>
                <span className="value">{p.value}</span>
              </div>
              <span className="crm-line">{p.opportunity}</span>
              <div className="crm-card-foot">
                <Chip tone="accent">{p.stage}</Chip>
                <small>{p.owner}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* OUTREACH — cold-email drafts awaiting approval */}
      <section className="crm-col">
        <header className="crm-col-head">
          <h3>OUTREACH</h3>
          <span className="count">{drafts.length}</span>
        </header>
        <p className="crm-col-sub">Cold emails drafted by Copywright — approve to send</p>
        <div className="crm-cards">
          {drafts.slice(0, limit).map((d) => (
            <article className="crm-card" key={d.id}>
              <div className="crm-card-top">
                <strong>{d.company}</strong>
                {draftChip(d)}
              </div>
              <span className="crm-line">To: {d.toEmail || <em>no email found</em>}</span>
              {editing === d.id ? (
                <div style={{ display: 'grid', gap: 6, margin: '6px 0' }}>
                  <input
                    className="input"
                    value={editToEmail}
                    onChange={(e) => setEditToEmail(e.target.value)}
                    placeholder="Recipient Email (e.g. contact@target.com)"
                  />
                  <input
                    className="input"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Subject"
                  />
                  <textarea
                    className="input"
                    rows={6}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Email body"
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" disabled={busyId === d.id} onClick={() => saveEdit(d.id)}>
                      Save
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="crm-line dim" style={{ fontWeight: 600 }}>{d.subject}</span>
                  <span className="crm-line dim">
                    {d.body.length > 140 ? `${d.body.slice(0, 140)}…` : d.body}
                  </span>
                  {d.error && <span className="crm-line" style={{ color: 'var(--warn)' }}>{d.error}</span>}
                </>
              )}
              <div className="crm-card-foot">
                <small>{d.findings.length} finding(s) referenced</small>
                <small>{d.lastActivity}</small>
              </div>
              {d.status === 'Draft' && editing !== d.id && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busyId === d.id}
                    onClick={() => act(d.id, approveDraft)}
                  >
                    {busyId === d.id ? 'Sending…' : 'Approve & send'}
                  </button>
                  <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => startEdit(d)}>
                    Edit
                  </button>
                  <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, rejectDraft)}>
                    Reject
                  </button>
                </div>
              )}
              {d.status === 'Failed' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, sendDraft)}>
                    {busyId === d.id ? 'Sending…' : 'Retry send'}
                  </button>
                  <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => startEdit(d)}>
                    Edit
                  </button>
                  <button className="btn btn-sm" disabled={busyId === d.id} onClick={() => act(d.id, rejectDraft)}>
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
          {drafts.length === 0 && <small className="dim">No drafts yet — run a cycle.</small>}
        </div>
      </section>

      {/* REPLY */}
      <section className="crm-col">
        <header className="crm-col-head">
          <h3>REPLY</h3>
          <span className="count">{replies.length}</span>
        </header>
        <p className="crm-col-sub">Responses handled by the Responder (Chatbot)</p>
        <div className="crm-cards">
          {replies.slice(0, limit).map((r) => (
            <article className="crm-card" key={r.id}>
              <div className="crm-card-top">
                <strong>{r.company}</strong>
                <Chip tone={r.status === 'Meeting booked' ? 'success' : r.status === 'Awaiting' ? 'warn' : 'neutral'}>
                  {r.status}
                </Chip>
              </div>
              <span className="crm-line">
                {r.contact} · {r.channel}
              </span>
              <span className="crm-line dim">{r.summary}</span>
              <div className="crm-card-foot">
                <small>Responder agent</small>
                <small>{r.lastActivity}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
