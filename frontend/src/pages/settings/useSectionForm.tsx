import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../../components/feedback';
import type { Result } from '../../lib/api';
import { addNavigationGuard } from '../../lib/router';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local form state for one Settings section: tracks unsaved changes, warns
 * before leaving (in-app navigation and tab close), saves only this section.
 */
export function useSectionForm<T>(initial: T, persist: (value: T) => Promise<Result<unknown>>) {
  const [saved, setSaved] = useState<T>(initial);
  const [value, setValue] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const dirty = !same(value, saved);

  // a fresh server copy (e.g. a profile switch) replaces an untouched form
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setValue((v) => (same(v, savedRef.current) ? initial : v));
    setSaved(initial);
  }, [initialKey]);

  useEffect(() => {
    if (!dirty) return;
    const removeGuard = addNavigationGuard(() => window.confirm('You have unsaved changes. Leave without saving?'));
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      removeGuard();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty]);

  const save = useCallback(async () => {
    setSaving(true);
    const res = await persist(value);
    setSaving(false);
    if (res.ok) {
      setSaved(value);
      toast.success('Saved.');
    } else {
      toast.error(res.error);
    }
    return res.ok;
  }, [persist, value]);

  const discard = useCallback(() => setValue(saved), [saved]);

  return { value, setValue, dirty, saving, save, discard };
}

/** Sticky bar that appears only while a section has unsaved changes. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="save-bar" role="region" aria-label="Unsaved changes">
      <span>You have unsaved changes</span>
      <button className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={saving}>
        Discard
      </button>
      <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
