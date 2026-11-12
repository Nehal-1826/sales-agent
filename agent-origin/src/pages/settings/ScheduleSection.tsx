import { toast } from '../../components/feedback';
import { Field, Toggle } from '../../components/ui';
import { putSettings, sendTestReport } from '../../lib/api';
import type { FrequentRuns, ReportConfig, RunFrequency, SettingsState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

const OPTIONS: { value: RunFrequency; label: string; hint: string }[] = [
  { value: '15m', label: 'Every 15 minutes', hint: 'Most leads, uses the most credits' },
  { value: '1h', label: 'Every hour', hint: 'Recommended for most teams' },
  { value: '6h', label: 'Every 6 hours', hint: 'A steady trickle' },
  { value: 'daily', label: 'Once a day', hint: 'Light and quiet' },
];

interface ScheduleForm {
  runs: FrequentRuns;
  report: ReportConfig;
}

/** Schedule & reports — how often to search, and where the evening report goes. */
export function ScheduleSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const form = useSectionForm<ScheduleForm>({ runs: settings.runs, report: settings.report }, async (v) => {
    const res = await putSettings({ runs: v.runs, report: v.report });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const { runs, report } = form.value;

  const testReport = async () => {
    if (form.dirty && !(await form.save())) return;
    const res = await sendTestReport();
    if (!res.ok) return toast.error(res.error);
    if (res.data.status === 'smtp') toast.success(`Report sent to ${res.data.recipients.join(', ')}.`);
    else if (res.data.status === 'console') toast.error("Not sent: connect your email first (Settings → Email sending).");
    else toast.error('Add a report email address first.');
  };

  return (
    <section className="panel settings-panel" aria-labelledby="sec-schedule">
      <h2 id="sec-schedule" className="section-title">
        Schedule & reports
      </h2>

      <div className="settings-row">
        <div>
          <strong>Autopilot</strong>
          <small>Search for new companies automatically. Turn off to only search when you ask.</small>
        </div>
        <Toggle
          checked={runs.enabled}
          onChange={(enabled) => form.setValue({ ...form.value, runs: { ...runs, enabled } })}
          label="Autopilot"
        />
      </div>

      <fieldset className="run-options" disabled={!runs.enabled}>
        <legend className="field-label">How often</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className={`run-option${runs.frequency === o.value ? ' active' : ''}`}>
            <input
              type="radio"
              name="run-frequency"
              value={o.value}
              checked={runs.frequency === o.value}
              onChange={() => form.setValue({ ...form.value, runs: { ...runs, frequency: o.value } })}
            />
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </label>
        ))}
      </fieldset>

      <hr className="divider" />

      <Field label="Daily report goes to" hint="Sent every evening at 8 PM IST. Separate several addresses with commas.">
        <input
          type="email"
          multiple
          value={report.email}
          placeholder="you@company.com"
          onChange={(e) => form.setValue({ ...form.value, report: { email: e.target.value } })}
        />
      </Field>
      <div className="settings-row">
        <button className="btn" onClick={() => void testReport()}>
          Send a test report now
        </button>
      </div>

      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </section>
  );
}
