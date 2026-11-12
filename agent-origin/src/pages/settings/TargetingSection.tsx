import { useState } from 'react';
import { LoadError, toast } from '../../components/feedback';
import { TagInput } from '../../components/TagInput';
import { Chip, Field } from '../../components/ui';
import { activateProfile, createProfile, getProfiles, putSettings } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import {
  AGENCY_INDUSTRY_SUGGESTIONS,
  BUYER_INDUSTRY_SUGGESTIONS,
  CITY_SUGGESTIONS,
  COUNTRY_SUGGESTIONS,
} from '../../lib/targetingOptions';
import type { IcpMode, SearchProfile, SettingsState, TargetingState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

/** Who to find — saved targeting profiles + the live targeting itself. */
export function TargetingSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const profiles = useAsync(getProfiles);
  const form = useSectionForm<TargetingState>(settings.targeting, async (targeting) => {
    const res = await putSettings({ targeting });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const t = form.value;
  const set = (patch: Partial<TargetingState>) => form.setValue({ ...t, ...patch });
  const [switching, setSwitching] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const activate = async (p: SearchProfile) => {
    if (form.dirty && !window.confirm('Switching replaces your unsaved targeting changes. Continue?')) return;
    setSwitching(p.id);
    const res = await activateProfile(p.id);
    setSwitching(null);
    if (!res.ok) return toast.error(res.error);
    form.discard();
    onSaved(res.data.settings);
    void profiles.reload();
    toast.success(`Now finding leads for “${p.name}”. The next search uses it.`);
  };

  const saveAsProfile = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await createProfile({ name, description: '', ...t });
    if (!res.ok) return toast.error(res.error);
    setNewName('');
    void profiles.reload();
    toast.success(`Saved “${name}”. Activate it any time to switch back to this targeting.`);
  };

  const agency = t.icpMode === 'agency';

  return (
    <section className="panel settings-panel" aria-labelledby="sec-targeting">
      <h2 id="sec-targeting" className="section-title">
        Who to find
      </h2>

      <div className="subsection">
        <h3 className="subsection-title">Saved profiles</h3>
        <p className="panel-note">Switch everything below in one click. The next search uses the active profile.</p>
        {profiles.error && !profiles.data ? (
          <LoadError message={profiles.error} onRetry={() => void profiles.reload()} />
        ) : (
          <ul className="profile-list">
            {(profiles.data ?? []).map((p) => (
              <li key={p.id} className={`profile-row${p.isActive ? ' active' : ''}`}>
                <div>
                  <strong>{p.name}</strong>
                  {p.description && <small>{p.description}</small>}
                  <small className="dim">
                    {p.icpMode === 'agency' ? 'Partner agencies' : 'Customers'} ·{' '}
                    {p.cities.length ? p.cities.join(', ') : p.countries.length ? p.countries.join(', ') : 'Anywhere'}
                  </small>
                </div>
                {p.isActive ? (
                  <Chip tone="success">Active</Chip>
                ) : (
                  <button className="btn btn-sm" onClick={() => void activate(p)} disabled={switching !== null}>
                    {switching === p.id ? 'Switching…' : 'Use this'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="subsection">
        <h3 className="subsection-title">Current targeting</h3>
        <fieldset className="segmented wide">
          <legend className="field-label">Who are you looking for?</legend>
          {(
            [
              ['buyer', 'Customers', 'Businesses that would buy what you sell. Competitors are filtered out.'],
              ['agency', 'Partner agencies', 'Agencies and studios that could pass you project work.'],
            ] as [IcpMode, string, string][]
          ).map(([mode, label, hint]) => (
            <label key={mode} className={t.icpMode === mode ? 'active' : ''}>
              <input type="radio" name="icp" checked={t.icpMode === mode} onChange={() => set({ icpMode: mode })} />
              <strong>{label}</strong>
              <small>{hint}</small>
            </label>
          ))}
        </fieldset>

        <TagInput
          label="Towns and cities"
          values={t.cities}
          onChange={(cities) => set({ cities })}
          suggestions={CITY_SUGGESTIONS}
          placeholder="e.g. Salem, Coimbatore"
          emptyHint="None: searching whole countries. Add towns to focus on local businesses (these win over countries)."
        />
        <TagInput
          label="Countries"
          values={t.countries}
          onChange={(countries) => set({ countries })}
          suggestions={COUNTRY_SUGGESTIONS}
          placeholder="e.g. India, UAE"
          emptyHint="None: searching worldwide."
        />
        <TagInput
          label={agency ? 'Kinds of agencies' : 'Kinds of businesses'}
          values={t.industries}
          onChange={(industries) => set({ industries })}
          suggestions={agency ? AGENCY_INDUSTRY_SUGGESTIONS : BUYER_INDUSTRY_SUGGESTIONS}
          placeholder={agency ? 'e.g. web development studio' : 'e.g. dental clinic'}
          emptyHint={
            agency
              ? 'None: using a built-in list of boutique agencies and studios.'
              : 'None: the assistant picks businesses likely to buy what you sell.'
          }
        />

        <div className="settings-row save-profile-row">
          <Field label="Save this targeting as a profile">
            <span className="input-with-action">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tamil Nadu clinics" />
              <button className="btn" onClick={() => void saveAsProfile()} disabled={!newName.trim() || form.dirty}>
                Save profile
              </button>
            </span>
          </Field>
          {form.dirty && <small className="dim">Save your changes first.</small>}
        </div>
      </div>

      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </section>
  );
}
