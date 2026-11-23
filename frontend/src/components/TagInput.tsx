import { useId, useState } from 'react';

/** Add/remove a list of short values (services, cities, countries…). */
export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
  emptyHint,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  emptyHint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = () => {
    const parts = draft
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setDraft('');
  };

  return (
    <div className="tags-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="input-with-action">
        <input
          id={id}
          list={suggestions.length ? `${id}-options` : undefined}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          // leaving the field commits what was typed — it used to vanish
          // unless Enter or "Add" was pressed, so "Save changes" saved nothing
          onBlur={add}
        />
        {suggestions.length > 0 && (
          <datalist id={`${id}-options`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        {/* keep focus in the input on press, so the blur commit and this
            click never both run for one press */}
        <button
          type="button"
          className="btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={add}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>
      <ul className="tags" aria-label={`${label}: ${values.length} added`}>
        {values.map((v) => (
          <li className="tag" key={v}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              ×
            </button>
          </li>
        ))}
        {values.length === 0 && emptyHint && <li className="tags-empty">{emptyHint}</li>}
      </ul>
    </div>
  );
}
