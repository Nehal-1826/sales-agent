import { TagInput } from '../../components/TagInput';
import { Field } from '../../components/ui';
import { putSettings } from '../../lib/api';
import type { CompanyProfile, SettingsState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

/** Your business — the facts every email and every search is built from. */
export function BusinessSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const form = useSectionForm<CompanyProfile>(settings.company, async (company) => {
    const res = await putSettings({ company });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const c = form.value;
  const set = (patch: Partial<CompanyProfile>) => form.setValue({ ...c, ...patch });

  return (
    <section className="panel settings-panel" aria-labelledby="sec-business">
      <h2 id="sec-business" className="section-title">
        Your business
      </h2>
      <p className="panel-note">
        Your assistant uses this to decide which companies need what you sell, and to sign every email.
      </p>
      <div className="settings-grid">
        <Field label="Company name">
          <input value={c.name} onChange={(e) => set({ name: e.target.value })} autoComplete="organization" />
        </Field>
        <Field label="Website">
          <input
            value={c.website}
            onChange={(e) => set({ website: e.target.value })}
            placeholder="yourcompany.com"
            inputMode="url"
          />
        </Field>
      </div>
      <Field label="What you do" hint="Two or three sentences, the way you'd describe it to a customer.">
        <textarea rows={4} value={c.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <TagInput
        label="What you sell"
        values={c.services}
        onChange={(services) => set({ services })}
        placeholder="e.g. Custom web apps, then press Enter"
        emptyHint="Add at least one service so the assistant knows who buys from you."
      />
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </section>
  );
}
