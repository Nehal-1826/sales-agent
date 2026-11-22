import { useState } from 'react';
import { TagInput } from '../../components/TagInput';
import { Field } from '../../components/ui';
import { putSettings, scrapeCompanyDetails } from '../../lib/api';
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
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  /** Read the website and auto-fill name + description from its homepage. */
  const fetchDetails = async () => {
    if (fetching || !c.website.trim()) return;
    setFetching(true);
    setFetchError('');
    const res = await scrapeCompanyDetails(c.website.trim());
    setFetching(false);
    if (!res.ok) {
      setFetchError(res.error || "Couldn't read that website — check the address and try again.");
      return;
    }
    set({ name: res.data.name || c.name,
         description: res.data.description || c.description,
         ...(res.data.services?.length ? { services: res.data.services } : {}) });
  };

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
          <span className="input-with-action">
            <input
              value={c.website}
              onChange={(e) => set({ website: e.target.value })}
              placeholder="yourcompany.com"
              inputMode="url"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={fetching || !c.website.trim()}
              onClick={() => void fetchDetails()}
              aria-label="Fetch company details from the website"
              title="Read this website and auto-fill the details"
            >
              {fetching ? 'Fetching…' : 'Fetch'}
            </button>
          </span>
          {fetchError ? (
            <small className="field-hint" role="alert" style={{ color: 'var(--accent-strong)' }}>
              {fetchError}
            </small>
          ) : (
            <small className="field-hint">Fetch reads the site and fills the name + description below.</small>
          )}
        </Field>
      </div>
      <Field label="What you do" hint="Two or three sentences, the way you'd describe it to a customer.">
        <textarea rows={4} value={c.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field
        label="Business address"
        hint="Printed at the bottom of every email you send. Anti-spam laws require a real postal address."
      >
        <input
          value={c.address}
          onChange={(e) => set({ address: e.target.value })}
          placeholder="Street, city, PIN code, country"
          autoComplete="street-address"
        />
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
