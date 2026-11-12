import { useState } from 'react';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { ConfirmButton, Modal } from '../../components/overlay';
import { Chip, Field, Toggle } from '../../components/ui';
import {
  checkMailboxDns,
  createMailbox,
  deleteMailbox,
  getMailboxes,
  putSettings,
  resumeMailbox,
  syncWarmPulse,
  updateMailbox,
} from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import type {
  DnsCheckItem,
  Mailbox,
  MailboxInput,
  OutboxConfig,
  SettingsState,
  WarmPulseConfig,
} from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

const DNS_LABELS: { key: 'spf' | 'dkim' | 'dmarc' | 'mx'; label: string; what: string }[] = [
  { key: 'spf', label: 'Sender permission (SPF)', what: 'Tells inboxes your email provider may send for you.' },
  { key: 'dkim', label: 'Email signature (DKIM)', what: 'Proves your emails were not changed on the way.' },
  { key: 'dmarc', label: 'Domain policy (DMARC)', what: 'Tells inboxes what to do with fake emails using your name.' },
  { key: 'mx', label: 'Reply address (MX)', what: 'Lets replies reach your inbox.' },
];

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hourLabel = (h: number) => (h === 24 ? 'midnight' : `${String(h).padStart(2, '0')}:00`);

function when(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function DnsChecklist({ mailbox }: { mailbox: Mailbox }) {
  const dns = mailbox.dns || {};
  if (!mailbox.dnsCheckedAt) {
    return <p className="mailbox-muted">Domain check not run yet — press “Check domain setup”.</p>;
  }
  return (
    <div className="dns-checklist">
      {dns.error && <p className="mailbox-muted">{dns.error}</p>}
      <ul>
        {DNS_LABELS.map(({ key, label, what }) => {
          const item: DnsCheckItem | undefined = dns[key];
          const ok = Boolean(item?.ok);
          return (
            <li key={key} className={ok ? 'dns-ok' : 'dns-missing'}>
              <span className="dns-mark" aria-hidden>{ok ? '✓' : '!'}</span>
              <div>
                <strong>{label}</strong> — {ok ? 'looks good' : 'needs attention'}
                <small>{what}</small>
                {!ok && item?.hint && <small className="dns-fix">How to fix: {item.hint}</small>}
              </div>
            </li>
          );
        })}
      </ul>
      <small className="mailbox-muted">Checked {when(mailbox.dnsCheckedAt)} for {dns.domain || 'your domain'}.</small>
    </div>
  );
}

function statusChip(mb: Mailbox) {
  if (!mb.isActive) return <Chip>Switched off</Chip>;
  if (mb.paused) return <Chip tone="warn">Paused</Chip>;
  if (!mb.configured) return <Chip tone="warn">Login missing</Chip>;
  if (mb.effectiveCap < mb.dailyCap) return <Chip tone="accent">Warming up</Chip>;
  return <Chip tone="success">Sending</Chip>;
}

function MailboxCard({ mb, onChanged, onEdit }: { mb: Mailbox; onChanged: () => void; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast.success(done);
      onChanged();
    } else toast.error(res.error ?? 'Something went wrong.');
  };
  const pct = mb.effectiveCap ? Math.min(100, Math.round((mb.sentToday / mb.effectiveCap) * 100)) : 0;

  return (
    <article className="mailbox-card">
      <header className="mailbox-head">
        <div>
          <strong>{mb.label || mb.fromEmail}</strong>
          <small>{mb.fromEmail}</small>
        </div>
        {statusChip(mb)}
      </header>

      {mb.paused && (
        <p className="mailbox-paused">
          Paused until {when(mb.pausedUntil)}: {mb.pausedReason || 'stopped to protect your mailbox.'} Emails waiting
          for it move to another mailbox, or wait.
        </p>
      )}

      <div className="mailbox-meter" aria-label={`Sent today ${mb.sentToday} of ${mb.effectiveCap}`}>
        <div className="mailbox-meter-bar"><span style={{ width: `${pct}%` }} /></div>
        <small>
          Sent today: <strong>{mb.sentToday}</strong> of {mb.effectiveCap}
          {mb.effectiveCap < mb.dailyCap && ` (warming up — grows to ${mb.dailyCap} a day)`}
          {mb.queued > 0 && ` · ${mb.queued} waiting to send`}
        </small>
      </div>

      <DnsChecklist mailbox={mb} />

      {(mb.warmupStatus || mb.healthScore !== null) && (
        <p className="mailbox-muted">
          WarmPulse: {mb.warmupStatus || 'linked'}
          {mb.healthScore !== null && ` · health ${Math.round(mb.healthScore)}/100`}
          {mb.stillWarming && ' · still warming, so we keep sending slowly'}
        </p>
      )}

      <div className="mailbox-actions">
        <button className="btn btn-sm" disabled={busy} onClick={() => void run(() => checkMailboxDns(mb.id), 'Domain check finished.')}>
          Check domain setup
        </button>
        {mb.paused && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run(() => resumeMailbox(mb.id), 'Sending resumed.')}>
            Resume sending
          </button>
        )}
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onEdit}>
          Edit
        </button>
        <ConfirmButton
          className="btn btn-sm btn-ghost"
          disabled={busy}
          confirmLabel="Click again to remove"
          onConfirm={() => void run(() => deleteMailbox(mb.id), 'Mailbox removed.')}
        >
          Remove
        </ConfirmButton>
      </div>
    </article>
  );
}

const EMPTY_INPUT: MailboxInput = {
  label: '', fromEmail: '', fromName: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '',
  imapHost: '', imapPort: null, dailyCap: 30, isActive: true,
};

function MailboxModal({ mailbox, onClose, onSaved }: { mailbox: Mailbox | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<MailboxInput>(mailbox ? {
    label: mailbox.label, fromEmail: mailbox.fromEmail, fromName: mailbox.fromName, smtpHost: mailbox.smtpHost,
    smtpPort: mailbox.smtpPort, smtpUser: mailbox.smtpUser, smtpPassword: mailbox.smtpPassword,
    imapHost: mailbox.imapHost, imapPort: mailbox.imapPort, dailyCap: mailbox.dailyCap, isActive: mailbox.isActive,
  } : EMPTY_INPUT);
  const [saving, setSaving] = useState(false);
  const set = (patch: MailboxInput) => setV({ ...v, ...patch });

  const save = async () => {
    if (!v.fromEmail?.trim()) return toast.error('Enter the email address this mailbox sends from.');
    setSaving(true);
    const body = { ...v, smtpUser: v.smtpUser || v.fromEmail };
    const res = mailbox ? await updateMailbox(mailbox.id, body) : await createMailbox(body);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(mailbox ? 'Mailbox updated.' : 'Mailbox added — it starts slowly and speeds up over two weeks.');
    onSaved();
  };

  return (
    <Modal
      title={mailbox ? 'Edit mailbox' : 'Add a mailbox'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save mailbox'}
          </button>
        </>
      }
    >
      <Field label="Send from (email address)">
        <input type="email" value={v.fromEmail ?? ''} placeholder="sales@yourcompany.com" onChange={(e) => set({ fromEmail: e.target.value })} />
      </Field>
      <Field label="Sender name" hint="What people see next to your email, e.g. “Priya at Acme”.">
        <input value={v.fromName ?? ''} onChange={(e) => set({ fromName: e.target.value })} />
      </Field>
      <Field label="Mail server" hint="From your email provider, e.g. smtp.gmail.com or smtp.zoho.in.">
        <input value={v.smtpHost ?? ''} placeholder="smtp.gmail.com" onChange={(e) => set({ smtpHost: e.target.value })} />
      </Field>
      <Field label="Port" hint="Usually 587 (or 465).">
        <input type="number" value={v.smtpPort ?? 587} onChange={(e) => set({ smtpPort: Number(e.target.value) || 587 })} />
      </Field>
      <Field label="Login (usually the same email)">
        <input value={v.smtpUser ?? ''} placeholder={v.fromEmail || ''} onChange={(e) => set({ smtpUser: e.target.value })} />
      </Field>
      <Field label="Password / app password" hint="Gmail and Zoho need an app password, not your normal login.">
        <input type="password" value={v.smtpPassword ?? ''} autoComplete="new-password" onChange={(e) => set({ smtpPassword: e.target.value })} />
      </Field>
      <Field label="Most emails per day" hint="30 is a safe number for one mailbox. A new mailbox starts at 5 a day and grows to this over two weeks.">
        <input type="number" min={1} max={500} value={v.dailyCap ?? 30} onChange={(e) => set({ dailyCap: Number(e.target.value) || 30 })} />
      </Field>
      <div className="settings-row">
        <div>
          <strong>Use this mailbox</strong>
          <small>Switch off to stop sending from it without deleting it.</small>
        </div>
        <Toggle checked={Boolean(v.isActive)} onChange={(isActive) => set({ isActive })} label="Use this mailbox" />
      </div>
    </Modal>
  );
}

interface OutboxForm {
  outbox: OutboxConfig;
  warmpulse: WarmPulseConfig;
}

/** Mailboxes — where cold email goes out from, how fast, and whether each
 *  sending domain is set up so emails land in the inbox. */
export function MailboxesSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const list = useAsync(getMailboxes);
  const [editing, setEditing] = useState<Mailbox | 'new' | null>(null);
  const form = useSectionForm<OutboxForm>(
    {
      outbox: settings.outbox ?? { windowStart: 9, windowEnd: 18, weekdaysOnly: true },
      warmpulse: { apiUrl: settings.warmpulse?.apiUrl ?? 'https://warmpulse.tech', apiKey: settings.warmpulse?.apiKey ?? '' },
    },
    async (v) => {
      const res = await putSettings({ outbox: v.outbox, warmpulse: { apiUrl: v.warmpulse.apiUrl, apiKey: v.warmpulse.apiKey } });
      if (res.ok) onSaved(res.data);
      return res;
    },
  );
  const { outbox, warmpulse } = form.value;
  const setOutbox = (patch: Partial<OutboxConfig>) => form.setValue({ ...form.value, outbox: { ...outbox, ...patch } });

  const sync = async () => {
    if (form.dirty && !(await form.save())) return;
    const res = await syncWarmPulse();
    if (!res.ok) return toast.error(res.error);
    if (res.data.ok) {
      toast.success(`WarmPulse linked — ${res.data.matched ?? 0} mailbox(es) matched.`);
      void list.reload();
    } else toast.error(res.data.message ?? 'Could not reach WarmPulse.');
  };

  return (
    <section className="panel settings-panel" aria-labelledby="sec-mailboxes">
      <h2 id="sec-mailboxes" className="section-title">Mailboxes & sending speed</h2>
      <p className="mailbox-muted">
        Approved emails wait in a queue and go out one at a time, a few minutes apart, from your mailboxes. Each
        mailbox has a daily limit so your email provider never sees a sudden burst.
      </p>

      <div className="mailbox-toolbar">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Add a mailbox</button>
      </div>

      {list.loading && !list.data ? (
        <Skeleton rows={3} height={38} />
      ) : list.error && !list.data ? (
        <LoadError message={list.error} onRetry={() => void list.reload()} />
      ) : !list.data?.length ? (
        <EmptyState title="No mailbox yet">
          Add the email account you want to send from (or connect one under “Email sending”). Until then,
          approved emails are only written to the server log — they are not delivered.
        </EmptyState>
      ) : (
        <div className="mailbox-list">
          {list.data.map((mb) => (
            <MailboxCard key={mb.id} mb={mb} onChanged={() => void list.reload()} onEdit={() => setEditing(mb)} />
          ))}
        </div>
      )}

      <hr className="divider" />
      <h3 className="field-label">Sending hours (India time)</h3>
      <div className="mailbox-hours">
        <Field label="Start sending at">
          <select value={outbox.windowStart} onChange={(e) => setOutbox({ windowStart: Number(e.target.value) })}>
            {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </Field>
        <Field label="Stop sending at">
          <select value={outbox.windowEnd} onChange={(e) => setOutbox({ windowEnd: Number(e.target.value) })}>
            {HOURS.slice(1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </Field>
      </div>
      <div className="settings-row">
        <div>
          <strong>Weekdays only</strong>
          <small>Don't send on Saturday and Sunday — business emails do better on workdays.</small>
        </div>
        <Toggle checked={outbox.weekdaysOnly} onChange={(weekdaysOnly) => setOutbox({ weekdaysOnly })} label="Weekdays only" />
      </div>

      <hr className="divider" />
      <h3 className="field-label">WarmPulse (optional)</h3>
      <p className="mailbox-muted">
        If you warm up your mailboxes with WarmPulse, paste an API key from WarmPulse (Workspace → API keys). We
        then keep sending slowly while a mailbox is still warming up or its health is low.
      </p>
      <Field label="WarmPulse API key" hint="Leave empty to switch this off.">
        <input
          type="password"
          value={warmpulse.apiKey}
          placeholder="wp_live_…"
          autoComplete="off"
          onChange={(e) => form.setValue({ ...form.value, warmpulse: { ...warmpulse, apiKey: e.target.value } })}
        />
      </Field>
      <div className="settings-row">
        <button className="btn btn-sm" onClick={() => void sync()} disabled={!warmpulse.apiKey}>
          Check WarmPulse now
        </button>
      </div>

      {editing && (
        <MailboxModal
          mailbox={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}

      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </section>
  );
}
