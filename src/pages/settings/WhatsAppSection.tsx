import { useState } from 'react';
import { Banner, toast } from '../../components/feedback';
import { Field, Toggle } from '../../components/ui';
import { getWhatsAppQr, getWhatsAppStatus, putSettings, testWhatsApp } from '../../lib/api';
import type { SettingsState, WhatsAppConfig, WhatsAppStatus } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

export const WHATSAPP_WARNING =
  'Unofficial WhatsApp automation can get this number banned by WhatsApp. Use a separate number, keep volumes low, and only message businesses that published this number.';

/** WhatsApp — opt-in helper (open-wa), QR login, daily limit. */
export function WhatsAppSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const form = useSectionForm<WhatsAppConfig>(settings.whatsapp, async (v) => {
    const res = await putSettings({ whatsapp: v });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const wa = form.value;
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qr, setQr] = useState('');
  const [checking, setChecking] = useState(false);
  const [testTo, setTestTo] = useState('');

  const check = async () => {
    if (form.dirty && !(await form.save())) return;
    setChecking(true);
    try {
      const st = await getWhatsAppStatus();
      setStatus(st);
      if (st.reachable && !st.connected) {
        const q = await getWhatsAppQr();
        setQr(q.qr);
        if (q.error) toast.error(q.error);
      } else {
        setQr('');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the WhatsApp helper.');
    } finally {
      setChecking(false);
    }
  };

  const sendTest = async () => {
    const res = await testWhatsApp(testTo);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Test message sent to ${res.data.to}.`);
  };

  return (
    <section className="panel settings-panel" aria-labelledby="sec-whatsapp">
      <h2 id="sec-whatsapp" className="section-title">
        WhatsApp
      </h2>
      <Banner tone="error" title="Risk of a ban">
        {WHATSAPP_WARNING}
      </Banner>
      <p className="muted">
        Every WhatsApp message waits in Approvals for you — it is never sent without asking. Messages go out only in
        your sending hours, a few minutes apart. With this off, WhatsApp steps become an "Open in WhatsApp" task with the
        message already typed, which you send yourself.
      </p>

      <div className="settings-row">
        <div>
          <strong>Send WhatsApp messages through the helper</strong>
          <small>Needs the WhatsApp helper running next to the app (your technical contact can set it up).</small>
        </div>
        <Toggle checked={wa.enabled} onChange={(enabled) => form.setValue({ ...wa, enabled })} label="WhatsApp helper on" />
      </div>
      <div className="form-grid">
        <Field label="Helper address">
          <input value={wa.sidecarUrl} onChange={(e) => form.setValue({ ...wa, sidecarUrl: e.target.value })} />
        </Field>
        <Field label="Helper password" hint="The same secret the helper was started with.">
          <input
            type="password"
            autoComplete="off"
            value={wa.secret}
            onChange={(e) => form.setValue({ ...wa, secret: e.target.value })}
          />
        </Field>
        <Field label="Most messages per day" hint="Keep it low — 20 or fewer.">
          <input
            type="number"
            min={0}
            max={200}
            value={wa.dailyCap}
            onChange={(e) => form.setValue({ ...wa, dailyCap: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />

      <hr className="divider" />
      <h3 className="section-title">Connect the phone</h3>
      <div className="settings-row">
        <button className="btn" disabled={!wa.enabled || checking} onClick={() => void check()}>
          {checking ? 'Checking…' : 'Check connection / show QR code'}
        </button>
      </div>
      {status && (
        <p>
          {!status.reachable
            ? `Helper not reachable. ${status.error}`
            : status.connected
              ? `Connected. Sent today: ${status.sentToday} of ${status.dailyCap}.`
              : 'Not logged in yet — scan the QR code below.'}
        </p>
      )}
      {qr && (
        <div>
          <img className="wa-qr" src={qr} alt="WhatsApp login QR code" />
          <small className="muted">
            On the phone: WhatsApp → Settings → Linked devices → Link a device, then scan this code.
          </small>
        </div>
      )}
      {status?.connected && (
        <div className="form-grid">
          <Field label="Send a test message to (your own number)">
            <input value={testTo} placeholder="+91 98765 43210" onChange={(e) => setTestTo(e.target.value)} />
          </Field>
          <div>
            <button className="btn" disabled={!testTo.trim()} onClick={() => void sendTest()}>
              Send test
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
