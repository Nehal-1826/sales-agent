import { useState } from 'react';
import { toast } from '../../components/feedback';
import { TagInput } from '../../components/TagInput';
import { Field } from '../../components/ui';
import { putSettings, inferCompanyProfile, scrapeCompanyDetails } from '../../lib/api';
import type { CompanyInference, CompanyProfile, SettingsState, TargetingState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

type AiPick = Pick<CompanyInference, 'targetIndustries' | 'targetCountries' | 'icpNotes'>;

/** The form without its website box: typing the address IS the Fetch input,
 *  not an edit of their own that has to be saved by hand. */
const withoutWebsite = ({ website: _website, ...rest }: CompanyProfile) => JSON.stringify(rest);

/** "Who to find" nobody has set yet — the AI's reading may fill it in. */
const targetingUntouched = (t: TargetingState) =>
  t.icpMode !== 'agency' && !t.industries.length && !t.countries.length && !t.cities.length;

const aiTargeting = (pick: AiPick): TargetingState => ({
  industries: pick.targetIndustries,
  countries: pick.targetCountries,
  cities: [],
  icpMode: 'buyer',
  notes: pick.icpNotes,
});

/** Your business — the facts every email and every search are built from. */
export function BusinessSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const form = useSectionForm<CompanyProfile>(settings.company, async (company) => {
    const res = await putSettings({ company });
    if (res.ok) onSaved(res.data);
    return res;
  });
  const c = form.value;
  const set = (patch: Partial<CompanyProfile>) => form.setValue({ ...c, ...patch });
  // Fetch runs in two steps: the page's own facts at once, then the AI's reading
  const [phase, setPhase] = useState<'' | 'page' | 'ai'>('');
  const [fetchError, setFetchError] = useState('');
  const [fetchNote, setFetchNote] = useState('');
  // the AI's "Who to find" when the user already has one — offered, never forced
  const [aiPick, setAiPick] = useState<AiPick | null>(null);

  /** Read the website: fill this card and (while nobody has set it) Who to find. */
  const fetchDetails = async () => {
    if (phase || !c.website.trim()) return;
    const website = c.website.trim();
    // typed edits of their own (other than the website): leave the saving to them
    const wasDirty = withoutWebsite(c) !== withoutWebsite(form.saved);
    setPhase('page');
    setFetchError('');
    setFetchNote('');
    setAiPick(null);
    const page = await scrapeCompanyDetails(website);
    if (!page.ok) {
      setPhase('');
      setFetchError(page.error || "Couldn't read that website — check the address and try again.");
      return;
    }
    const facts: CompanyProfile = {
      ...c,
      name: page.data.name || c.name,
      description: page.data.description || c.description,
      services: page.data.services?.length ? page.data.services : c.services,
      address: page.data.address || c.address,
    };
    set(facts);
    setPhase('ai');
    const ai = await inferCompanyProfile(website);
    setPhase('');
    if (!ai.ok) {
      setFetchNote(`I filled in the basics from the page, but the AI didn't finish reading it (${ai.error}). Press Fetch to try again.`);
      return;
    }
    const read = ai.data;
    const filled: CompanyProfile = {
      ...facts,
      name: read.name || facts.name,
      description: read.description || facts.description,
      address: read.address || facts.address,
      services: read.services.length ? read.services : facts.services,
    };
    let leads: string[] = [];
    let pick: AiPick | null = null;
    if (read.targetIndustries.length) {
      if (targetingUntouched(settings.targeting)) {
        const res = await putSettings({ targeting: aiTargeting(read) });
        if (res.ok) {
          onSaved(res.data);
          leads = read.targetIndustries;
        } else {
          toast.error(res.error);
        }
      } else {
        pick = {
          targetIndustries: read.targetIndustries,
          targetCountries: read.targetCountries,
          icpNotes: read.icpNotes,
        };
        setAiPick(pick);
      }
    }
    if (wasDirty) set(filled);
    else await form.save(filled);

    const done = wasDirty ? 'filled in' : 'saved';
    const where = read.targetCountries.length ? ` in ${read.targetCountries.join(', ')}` : ' worldwide';
    const yours = wasDirty ? ' Press Save changes to keep them.' : '';
    if (leads.length) {
      setFetchNote(`Read your website and ${done} everything, including Who to find: ${leads.join(', ')}${where}. Change anything you like.`);
    } else if (pick) {
      setFetchNote(`Read your website and ${done} your details. Who to find was already set, so I left it. The AI's pick for you: ${pick.targetIndustries.join(', ')}.`);
    } else if (read.customerType === 'individuals') {
      setFetchNote(`Read your website and ${done} your details. Your customers look like individual people, so Who to find is left for you to set.${yours}`);
    } else if (!read.inferred) {
      setFetchNote(`Read your website and ${done} the basics. The AI couldn't work out what you sell or who buys from you, so add those yourself.${yours}`);
    } else {
      setFetchNote(`Read your website and ${done} your details. I couldn't work out who buys from you, so Who to find is yours to set.${yours}`);
    }
  };

  /** The user already had a "Who to find"; they now ask for the AI's instead. */
  const useAiPick = async () => {
    if (!aiPick) return;
    const res = await putSettings({ targeting: aiTargeting(aiPick) });
    if (!res.ok) return toast.error(res.error);
    onSaved(res.data);
    setFetchNote(`Who to find is now: ${aiPick.targetIndustries.join(', ')}. Change it any time under Who to find.`);
    setAiPick(null);
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
              disabled={phase !== ''}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={phase !== '' || !c.website.trim()}
              onClick={() => void fetchDetails()}
              aria-label="Read the website and fill everything in"
              title="Read this website and fill everything in"
            >
              {phase === 'ai' ? 'AI reading…' : phase === 'page' ? 'Reading…' : 'Fetch'}
            </button>
          </span>
          {fetchError ? (
            <small className="field-hint" role="alert" style={{ color: 'var(--accent-strong)' }}>
              {fetchError}
            </small>
          ) : fetchNote ? (
            <small className="field-hint" role="status">
              {fetchNote}{' '}
              {aiPick && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void useAiPick()}>
                  Use the AI&apos;s pick
                </button>
              )}
            </small>
          ) : (
            <small className="field-hint">
              {phase === 'ai'
                ? 'Reading your website with the AI — it takes a minute or so. It works out what you sell and who buys from you.'
                : 'Fetch reads the site and fills everything in — what you sell and Who to find too.'}
            </small>
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
        emptyHint="Add at least one service so the assistant knows who buys from you — or press Fetch next to your website."
      />
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </section>
  );
}
