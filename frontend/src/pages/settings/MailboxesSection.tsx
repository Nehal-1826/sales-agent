import { useState } from 'react';
import { AnimatedList } from '../../components/AnimatedList';
import { GlideSelect } from '../../components/GlideSelect';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { ConfirmButton, Modal } from '../../components/overlay';
import { Chip, Field, Toggle } from '../../components/ui';
import {
  checkMailboxDns,
  createMailbox,
  deleteMailbox,
  enrollMailboxWarmup,
  getMailboxes,
  putSettings,
  resumeMailbox,
  testMailboxConnection,
  updateMailbox,
} from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { fmtDateTime, fmtNumber } from '../../lib/format';
import type {
  DnsCheckItem,
  Mailbox,
  MailboxInput,
  MailboxProbeLeg,
  MailboxProbeResult,
  OutboxConfig,
  SettingsState,
} from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

const DNS_LABELS: { key: 'spf' | 'dkim' | 'dmarc' | 'mx'; label: string; what: string }[] = [
  { key: 'spf', label: 'Sender permission (SPF)', what: 'Tells inboxes your email provider may send for you.' },
  { key: 'dkim', label: 'Email signature (DKIM)', what: 'Proves your emails were not changed on the way.' },
  { key: 'dmarc', label: 'Domain policy (DMARC)', what: 'Tells inboxes what to do with fake emails using your name.' },
  { key: 'mx', label: 'Reply address (MX)', what: 'Lets replies reach your inbox.' },
];

const HOURS = Array.from({ length: 25 }, (_, h) => h);
// These label the hours a person PICKS for their sending window, so they stay
// written 24-hour like "09:00" — the value of a choice, not a stored schedule
// on show (that one goes through fmtTime).
const hourLabel = (h: number) => (h === 24 ? 'midnight' : `${String(h).padStart(2, '0')}:00`);

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
      <small className="mailbox-muted">Checked {fmtDateTime(mailbox.dnsCheckedAt, 'medium')} for {dns.domain || 'your domain'}.</small>
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

function warmupChip(mb: Mailbox) {
  if (!mb.warmupEnrolled) return <Chip>Warmup off</Chip>;
  if (mb.warmupEnrollError) return <Chip tone="warn">⚠ Warmup not enrolled</Chip>;
  return <Chip tone="success">✓ Warmup enrolled</Chip>;
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
          Paused until {fmtDateTime(mb.pausedUntil, 'medium')}: {mb.pausedReason || 'stopped to protect your mailbox.'} Emails waiting
          for it move to another mailbox, or wait.
        </p>
      )}

      <div className="mailbox-meter" aria-label={`Sent today ${mb.sentToday} of ${mb.effectiveCap}`}>
        <div className="mailbox-meter-bar"><span style={{ width: `${pct}%` }} /></div>
        <small>
          Sent today: <strong>{mb.sentToday}</strong> of {mb.effectiveCap}
          {mb.effectiveCap < mb.dailyCap && ` (warming up — grows to ${mb.dailyCap} a day)`}
          {mb.queued > 0 && ` · ${fmtNumber(mb.queued)} waiting to send`}
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

      <div className="settings-row">
        <div>
          <strong>Warmup {warmupChip(mb)}</strong>
          <small>
            {!mb.warmupEnrolled
              ? 'Off — this mailbox is not added to the warmup network when its login is verified.'
              : mb.warmupEnrollError
                ? `Could not add it to warmup: ${mb.warmupEnrollError}`
                : 'Added to the warmup network when its login is verified.'}
          </small>
        </div>
        {mb.warmupEnrolled && mb.warmupEnrollError && (
          <button className="btn btn-sm" disabled={busy} onClick={() => void run(() => enrollMailboxWarmup(mb.id), 'Mailbox added to warmup.')}>
            Retry
          </button>
        )}
        <Toggle
          checked={mb.warmupEnrolled}
          onChange={(warmupEnrolled) => void run(
            // switching on enrolls right away (the endpoint stores the flag
            // itself on success); switching off only stores the flag
            () => (warmupEnrolled ? enrollMailboxWarmup(mb.id) : updateMailbox(mb.id, { warmupEnrolled: false })),
            warmupEnrolled ? 'Mailbox added to warmup.' : 'Warmup switched off for this mailbox.',
          )}
          label="Enroll this mailbox in warmup"
        />
      </div>

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

/* Wizard presets — Gmail-like add flow: pick the provider, the servers fill
 * in, Test Connection proves the login before saving.  Zoho auth is
 * datacenter-locked, so its zone (.in / .eu / .com) picks the hosts. */
type ProviderKey = 'gmail' | 'zoho' | 'outlook' | 'custom';

const PROVIDERS: { key: ProviderKey; label: string }[] = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'zoho', label: 'Zoho Mail' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'custom', label: 'Custom' },
];

const ZOHO_ZONES = [
  { key: 'in', label: 'India (.in)', imapHost: 'imap.zoho.in', smtpHost: 'smtp.zoho.in' },
  { key: 'eu', label: 'Europe (.eu)', imapHost: 'imap.zoho.eu', smtpHost: 'smtp.zoho.eu' },
  { key: 'com', label: 'Global (.com)', imapHost: 'imap.zoho.com', smtpHost: 'smtp.zoho.com' },
];

function presetFor(provider: ProviderKey, zone: string): Pick<MailboxInput, 'imapHost' | 'imapPort' | 'smtpHost' | 'smtpPort'> {
  if (provider === 'gmail')
    return { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 };
  if (provider === 'outlook')
    return { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 };
  if (provider === 'zoho') {
    const z = ZOHO_ZONES.find((x) => x.key === zone) ?? ZOHO_ZONES[0];
    return { imapHost: z.imapHost, imapPort: 993, smtpHost: z.smtpHost, smtpPort: 587 };
  }
  return { imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587 };
}

function detectProvider(mb: Mailbox): ProviderKey {
  const p = presetFor('gmail', '');
  const o = presetFor('outlook', '');
  if (mb.imapHost === p.imapHost && mb.smtpHost === p.smtpHost) return 'gmail';
  if (mb.imapHost === o.imapHost && mb.smtpHost === o.smtpHost) return 'outlook';
  if ((mb.smtpHost || '').endsWith('zoho.in') || (mb.smtpHost || '').endsWith('zoho.eu') || (mb.smtpHost || '').endsWith('zoho.com')) return 'zoho';
  return 'custom';
}

function detectZone(mb: Mailbox): string {
  const host = mb.smtpHost || '';
  if (host.endsWith('zoho.in')) return 'in';
  if (host.endsWith('zoho.eu')) return 'eu';
  if (host.endsWith('zoho.com')) return 'com';
  return 'in';
}

function ProbeLegRow({ name, leg }: { name: string; leg: MailboxProbeLeg }) {
  return (
    <li className={leg.ok ? 'dns-ok' : 'dns-missing'}>
      <span className="dns-mark" aria-hidden>{leg.ok ? '✓' : '!'}</span>
      <div>
        <strong>{name}</strong> — {leg.ok ? 'login works' : 'failed'}
        <small>{leg.detail}</small>
      </div>
    </li>
  );
}

function MailboxModal({ mailbox, onClose, onSaved }: { mailbox: Mailbox | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<MailboxInput>(mailbox ? {
    label: mailbox.label, fromEmail: mailbox.fromEmail, fromName: mailbox.fromName, smtpHost: mailbox.smtpHost,
    smtpPort: mailbox.smtpPort, smtpUser: mailbox.smtpUser, smtpPassword: mailbox.smtpPassword,
    imapHost: mailbox.imapHost, imapPort: mailbox.imapPort, dailyCap: mailbox.dailyCap, isActive: mailbox.isActive,
  } : { ...EMPTY_INPUT, ...presetFor('gmail', 'in') });
  const [provider, setProvider] = useState<ProviderKey>(mailbox ? detectProvider(mailbox) : 'gmail');
  const [zohoZone, setZohoZone] = useState(mailbox ? detectZone(mailbox) : 'in');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<MailboxProbeResult | null>(null);
  const set = (patch: MailboxInput) => setV({ ...v, ...patch });

  const applyProvider = (p: ProviderKey, zone = zohoZone) => {
    setProvider(p);
    setProbe(null); // hosts changed — the old result no longer applies
    set(presetFor(p, zone));
  };

  // manual SMTP/IMAP host/port edits invalidate the last probe too
  const setServers = (patch: MailboxInput) => {
    setProbe(null);
    set(patch);
  };

  const passwordTyped = Boolean(v.smtpPassword) && !(v.smtpPassword ?? '').includes('•');
  const verified = Boolean(probe?.imap.ok && probe?.smtp.ok);

  const test = async () => {
    if (!v.fromEmail?.trim()) return toast.error('Enter the email address this mailbox sends from.');
    if (!passwordTyped)
      return toast.error('Type the app password first — the saved one is hidden and cannot be retested.');
    setTesting(true);
    setProbe(null);
    const res = await testMailboxConnection({
      imapHost: v.imapHost ?? '', imapPort: v.imapPort ?? 993,
      smtpHost: v.smtpHost ?? '', smtpPort: v.smtpPort ?? 587,
      // probe the login the send path will actually use (save() sends
      // smtpUser || fromEmail; mailer._open_smtp authenticates as smtp_user)
      username: (v.smtpUser || v.fromEmail).trim(), password: v.smtpPassword ?? '',
    });
    setTesting(false);
    if (!res.ok) return toast.error(res.error);
    setProbe(res.data);
  };

  const save = async () => {
    if (!v.fromEmail?.trim()) return toast.error('Enter the email address this mailbox sends from.');
    setSaving(true);
    // loginVerified: the probe passed for exactly these servers + password
    // (any edit to them clears it) — the backend then auto-enrolls into warmup
    const body = { ...v, smtpUser: v.smtpUser || v.fromEmail, loginVerified: verified };
    const res = mailbox ? await updateMailbox(mailbox.id, body) : await createMailbox(body);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(mailbox
      ? 'Mailbox updated.'
      : verified
        ? 'Mailbox added — login verified, sending starts slowly and speeds up over two weeks.'
        : 'Mailbox added — it starts slowly and speeds up over two weeks.');
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
            {saving ? 'Saving…' : verified ? 'Save verified mailbox' : 'Save mailbox'}
          </button>
        </>
      }
    >
      {!mailbox && (
        <fieldset className="segmented" aria-label="Email provider">
          <legend className="field-label">Where is this mailbox hosted?</legend>
          {PROVIDERS.map((p) => (
            <label key={p.key} className={provider === p.key ? 'active' : ''}>
              <input type="radio" name="mailbox-provider" checked={provider === p.key} onChange={() => applyProvider(p.key)} />
              {p.label}
            </label>
          ))}
        </fieldset>
      )}
      {provider === 'zoho' && (
        <Field label="Zoho region" hint="Zoho logins only work against the datacenter that hosts the account.">
          <GlideSelect
            ariaLabel="Zoho region"
            size="lg"
            value={zohoZone}
            onChange={(next) => {
              setZohoZone(next);
              applyProvider('zoho', next);
            }}
            options={ZOHO_ZONES.map((z) => ({ value: z.key, label: z.label }))}
          />
        </Field>
      )}

      <Field label="Send from (email address)">
        <input type="email" value={v.fromEmail ?? ''} placeholder="sales@yourcompany.com" onChange={(e) => set({ fromEmail: e.target.value })} />
      </Field>
      <Field label="Sender name" hint="What people see next to your email, e.g. “Priya at Acme”.">
        <input value={v.fromName ?? ''} onChange={(e) => set({ fromName: e.target.value })} />
      </Field>
      <Field label="Login (usually the same email)">
        <input value={v.smtpUser ?? ''} placeholder={v.fromEmail || ''} onChange={(e) => set({ smtpUser: e.target.value })} />
      </Field>
      <Field label="Password / app password" hint="Gmail, Zoho and Outlook all need an app password, not your normal login.">
        <input type="password" value={v.smtpPassword ?? ''} autoComplete="new-password" onChange={(e) => { set({ smtpPassword: e.target.value }); setProbe(null); }} />
      </Field>

      <div className="mailbox-hours">
        <Field label="Sending server (SMTP)" hint={provider === 'custom' ? 'From your email provider, e.g. smtp.yourhost.com.' : undefined}>
          <input value={v.smtpHost ?? ''} placeholder="smtp.gmail.com" onChange={(e) => setServers({ smtpHost: e.target.value })} />
        </Field>
        <Field label="Port">
          <input type="number" value={v.smtpPort ?? 587} onChange={(e) => setServers({ smtpPort: Number(e.target.value) || 587 })} />
        </Field>
      </div>
      <div className="mailbox-hours">
        <Field label="Replies server (IMAP)" hint="Used to read answers and bounces. Leave the provider default when possible.">
          <input value={v.imapHost ?? ''} placeholder="imap.gmail.com" onChange={(e) => setServers({ imapHost: e.target.value })} />
        </Field>
        <Field label="Port">
          <input type="number" value={v.imapPort ?? 993} onChange={(e) => setServers({ imapPort: Number(e.target.value) || 993 })} />
        </Field>
      </div>

      <div className="mailbox-test">
        <button className="btn btn-sm" onClick={() => void test()} disabled={testing || saving || !v.smtpHost || !v.imapHost}>
          {testing ? <><span className="spinner" aria-hidden /> Testing…</> : 'Test connection'}
        </button>
        {mailbox && !passwordTyped && (
          <small className="mailbox-muted">Re-type the app password to test the saved login.</small>
        )}
        {probe && (
          <ul className="dns-checklist">
            <ProbeLegRow name="Sending (SMTP)" leg={probe.smtp} />
            <ProbeLegRow name="Replies (IMAP)" leg={probe.imap} />
          </ul>
        )}
      </div>

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

/** Mailboxes — where cold email goes out from, how fast, and whether each
 *  sending domain is set up so emails land in the inbox. */
export function MailboxesSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const list = useAsync(getMailboxes);
  const [editing, setEditing] = useState<Mailbox | 'new' | null>(null);
  const form = useSectionForm<OutboxConfig>(
    settings.outbox ?? { windowStart: 9, windowEnd: 18, weekdaysOnly: true },
    async (v) => {
      const res = await putSettings({ outbox: v });
      if (res.ok) onSaved(res.data);
      return res;
    },
  );
  const outbox = form.value;
  const setOutbox = (patch: Partial<OutboxConfig>) => form.setValue({ ...outbox, ...patch });

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
        <AnimatedList
          items={list.data}
          interactiveRows
          listClassName="mailbox-list"
          itemClassName="mailbox-card-item"
          getItemKey={(mb) => mb.id}
          animation="pop"
          theme="dark"
          frame={false}
          width="100%"
          maxHeight="none"
          showGradients={false}
          gap={12}
          accentColor="var(--accent)"
          renderItem={(mb) => (
            <MailboxCard mb={mb} onChanged={() => void list.reload()} onEdit={() => setEditing(mb)} />
          )}
        />
      )}

      <hr className="divider" />
      <h3 className="field-label">Sending hours (India time)</h3>
      <div className="mailbox-hours">
        <Field label="Start sending at">
          <GlideSelect
            ariaLabel="Start sending at"
            size="lg"
            value={String(outbox.windowStart)}
            onChange={(next) => setOutbox({ windowStart: Number(next) })}
            options={HOURS.slice(0, 24).map((h) => ({ value: String(h), label: hourLabel(h) }))}
          />
        </Field>
        <Field label="Stop sending at">
          <GlideSelect
            ariaLabel="Stop sending at"
            size="lg"
            value={String(outbox.windowEnd)}
            onChange={(next) => setOutbox({ windowEnd: Number(next) })}
            options={HOURS.slice(1).map((h) => ({ value: String(h), label: hourLabel(h) }))}
          />
        </Field>
      </div>
      <div className="settings-row">
        <div>
          <strong>Weekdays only</strong>
          <small>Don't send on Saturday and Sunday — business emails do better on workdays.</small>
        </div>
        <Toggle checked={outbox.weekdaysOnly} onChange={(weekdaysOnly) => setOutbox({ weekdaysOnly })} label="Weekdays only" />
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
