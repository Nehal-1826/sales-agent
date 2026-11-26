/**
 * Format — how this person reads dates, numbers and times on screen. India
 * and the 12-hour clock are the default for everyone; the choice is saved on
 * the account and every screen follows at once, without a reload.
 *
 * One card, reached three ways: Settings in the workspace app, Settings in
 * the console, and a button at the foot of the sidebar in both — Members
 * never see Settings, and every role has dates on screen.
 */
import { useEffect, useState } from 'react';
import { Field } from './ui';
import { toast } from './feedback';
import { attempt, inDemo, request } from '../lib/api';
import { CLOCK_LABELS, FORMAT_LABELS, preview, setPreferences, usePreferences } from '../lib/format';
import type { Clock, FormatPreset, Preferences } from '../lib/format';
import { isImpersonating } from '../lib/impersonation';
import { FormatDialog } from './FormatDialog';

const PRESETS: FormatPreset[] = ['IN', 'US', 'GB', 'device'];
const CLOCKS: Clock[] = ['12h', '24h'];
/** The server's own words for a personal setting inside "Enter as user". */
export const NOT_INSIDE = 'Not available while you are inside as another user.';

export function FormatCard({ onSaved }: { onSaved?: (saved: Preferences) => void }) {
  const saved = usePreferences();
  const [format, setFormat] = useState<FormatPreset>(saved.format);
  const [clock, setClock] = useState<Clock>(saved.clock);
  const [busy, setBusy] = useState(false);
  const dirty = format !== saved.format || clock !== saved.clock;

  // the profile may arrive after this card is drawn: follow it until the person picks
  useEffect(() => {
    if (!dirty) {
      setFormat(saved.format);
      setClock(saved.clock);
    }
  }, [saved, dirty]);

  async function save() {
    if (!dirty || busy) return;
    if (await inDemo()) return toast.error('This is the offline demo. Connect your workspace to do that.');
    setBusy(true);
    const body: Partial<Preferences> = {};          // only what changed is sent
    if (format !== saved.format) body.format = format;
    if (clock !== saved.clock) body.clock = clock;
    const r = await attempt(() =>
      request<Preferences>('/auth/preferences/', { method: 'PUT', body: JSON.stringify(body) }),
    );
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setPreferences(r.data);                           // every screen that shows a date or a number draws again
    toast.success('Format saved.');
    onSaved?.(r.data);
  }

  return (
    <div className="format-card">
      <div className="settings-grid">
        <Field label="Format" hint="Dates and numbers.">
          <select aria-label="Format" value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as FormatPreset)}>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {FORMAT_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Clock" hint="How times of day read.">
          <select aria-label="Clock" value={clock} disabled={busy} onChange={(e) => setClock(e.target.value as Clock)}>
            {CLOCKS.map((c) => (
              <option key={c} value={c}>
                {CLOCK_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="settings-row">
        <div>
          <small>
            With this it reads: <strong>{preview({ format, clock })}</strong>
          </small>
        </div>
        <button className="btn btn-primary" onClick={() => void save()} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save format'}
        </button>
      </div>
    </div>
  );
}

/** The sidebar's way in: what the person has now, and the dialog on a click. */
export function FormatButton() {
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  // inside "Enter as user" these are the customer's screens: not the admin's to change
  const inside = isImpersonating();
  return (
    <>
      <button
        type="button"
        className="nav-item side-format"
        aria-label="Format"
        title={inside ? NOT_INSIDE : 'How dates, numbers and times look on your screens'}
        disabled={inside}
        onClick={() => setOpen(true)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
        </svg>
        <span>{inside ? 'Format' : `${FORMAT_LABELS[prefs.format]} · ${prefs.clock === '12h' ? '12-hour' : '24-hour'}`}</span>
      </button>
      {open && <FormatDialog onClose={() => setOpen(false)} />}
    </>
  );
}
