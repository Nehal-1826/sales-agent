import { useEffect, useState } from 'react';
import { LoadError, Skeleton, toast } from '../../components/feedback';
import { Field, Toggle } from '../../components/ui';
import { getSequences, putSettings, saveSequence } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import type { FollowupsConfig, Sequence, SequenceChannel, SequenceStep, SettingsState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

const CHANNELS: { value: SequenceChannel; label: string; hint: string }[] = [
  { value: 'email', label: 'Email', hint: 'Sent in the same email thread, from the same mailbox.' },
  { value: 'linkedin_task', label: 'LinkedIn task', hint: 'You send it yourself — we open LinkedIn and give you a note (300 characters max).' },
  { value: 'call_task', label: 'Call task', hint: 'A reminder to call, with their number.' },
  { value: 'whatsapp', label: 'WhatsApp', hint: 'Needs your approval every time. Without the WhatsApp helper it becomes an "Open in WhatsApp" link.' },
];

const PLACEHOLDERS = '{{company}}, {{website}}, {{industry}}, {{sender_name}}, {{sender_website}}, {{services}}';

/** Follow-ups — on/off, send-without-asking, and the steps after the first email. */
export function FollowupsSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const form = useSectionForm<FollowupsConfig>(settings.followups, async (v) => {
    const res = await putSettings({ followups: v });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const fu = form.value;

  return (
    <section className="panel settings-panel" aria-labelledby="sec-followups">
      <h2 id="sec-followups" className="section-title">
        Follow-ups
      </h2>
      <p className="muted">
        After the first email is sent, we follow up a few days later in the same thread. Follow-ups stop the moment
        the company replies, the email bounces, they unsubscribe, or you mark the deal won or lost.
      </p>

      <div className="settings-row">
        <div>
          <strong>Send follow-ups</strong>
          <small>Companies get the steps below after their first email.</small>
        </div>
        <Toggle checked={fu.enabled} onChange={(enabled) => form.setValue({ ...fu, enabled })} label="Send follow-ups" />
      </div>
      <div className="settings-row">
        <div>
          <strong>Send follow-up emails without asking</strong>
          <small>
            Off: each follow-up waits in Approvals. On: follow-up emails go straight to the sending queue. WhatsApp
            messages always wait for your approval.
          </small>
        </div>
        <Toggle
          checked={fu.autoApprove}
          onChange={(autoApprove) => form.setValue({ ...fu, autoApprove })}
          label="Send follow-up emails without asking"
        />
      </div>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />

      <hr className="divider" />
      <SequenceEditor />
    </section>
  );
}

function SequenceEditor() {
  const loaded = useAsync(getSequences);
  const [seq, setSeq] = useState<Sequence | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const def = loaded.data?.find((s) => s.isDefault) ?? loaded.data?.[0] ?? null;
    setSeq(def);
    setDirty(false);
  }, [loaded.data]);

  if (loaded.loading) return <Skeleton rows={3} height={38} />;
  if (loaded.error) return <LoadError message={loaded.error} onRetry={() => void loaded.reload()} />;
  if (!seq) return <p className="muted">No follow-up steps yet.</p>;

  const setStep = (i: number, patch: Partial<SequenceStep>) => {
    setSeq({ ...seq, steps: seq.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) });
    setDirty(true);
  };
  const addStep = () => {
    const step: SequenceStep = {
      order: seq.steps.length + 1,
      channel: 'email',
      delayDays: 3,
      businessDays: true,
      subject: '',
      body: 'Hi {{company}} team,\n\n',
      personalize: false,
      enabled: true,
    };
    setSeq({ ...seq, steps: [...seq.steps, step] });
    setDirty(true);
  };
  const removeStep = (i: number) => {
    setSeq({ ...seq, steps: seq.steps.filter((_, j) => j !== i) });
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    const res = await saveSequence(seq);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setSeq(res.data);
    setDirty(false);
    toast.success('Follow-up steps saved.');
  };

  return (
    <div className="sequence-editor">
      <h3 className="section-title">Steps after the first email</h3>
      <small className="muted">You can use {PLACEHOLDERS}.</small>
      {seq.steps.map((st, i) => {
        const ch = CHANNELS.find((c) => c.value === st.channel);
        return (
          <div key={i} className={`panel sequence-step${st.enabled ? '' : ' muted'}`}>
            <div className="settings-row">
              <div>
                <strong>
                  Step {i + 1} · {ch?.label}
                </strong>
                <small>{ch?.hint}</small>
              </div>
              <Toggle checked={st.enabled} onChange={(enabled) => setStep(i, { enabled })} label={`Step ${i + 1} on`} />
            </div>
            <div className="form-grid">
              <Field label="Type">
                <select value={st.channel} onChange={(e) => setStep(i, { channel: e.target.value as SequenceChannel })}>
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Wait (days after the previous step)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={st.delayDays}
                  onChange={(e) => setStep(i, { delayDays: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={st.businessDays}
                onChange={(e) => setStep(i, { businessDays: e.target.checked })}
              />{' '}
              Count working days only (Mon–Fri)
            </label>
            {st.channel === 'email' && (
              <Field label="Subject" hint='Leave empty to reply in the same thread ("Re: …").'>
                <input value={st.subject} onChange={(e) => setStep(i, { subject: e.target.value })} />
              </Field>
            )}
            <Field
              label="Message"
              hint={st.channel === 'linkedin_task' ? `${st.body.length}/300 characters` : undefined}
            >
              <textarea
                rows={5}
                value={st.body}
                maxLength={st.channel === 'linkedin_task' ? 300 : undefined}
                onChange={(e) => setStep(i, { body: e.target.value })}
              />
            </Field>
            <div className="settings-row">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={st.personalize}
                  onChange={(e) => setStep(i, { personalize: e.target.checked })}
                />{' '}
                Let the AI make it more personal
              </label>
              <button className="btn btn-ghost" onClick={() => removeStep(i)}>
                Remove step
              </button>
            </div>
          </div>
        );
      })}
      <div className="settings-row">
        <button className="btn" onClick={addStep}>
          Add a step
        </button>
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save steps'}
        </button>
      </div>
    </div>
  );
}
