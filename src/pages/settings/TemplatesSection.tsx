import { useRef, useState } from 'react';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { ConfirmButton, Modal } from '../../components/overlay';
import { Chip, Field } from '../../components/ui';
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import type { EmailTemplate } from '../../lib/types';

const PLACEHOLDERS: [string, string][] = [
  ['{{company}}', 'their company name'],
  ['{{industry}}', 'their industry'],
  ['{{website}}', 'their website'],
  ['{{description}}', 'what they do (from research)'],
  ['{{sender_name}}', 'your company name'],
  ['{{sender_website}}', 'your website'],
  ['{{services}}', 'what you sell'],
];

type Editing = Partial<EmailTemplate> & { name: string; subject: string; body: string };

/** Email templates — the base every email starts from (AI personalises it per lead). */
export function TemplatesSection() {
  const templates = useAsync(getTemplates);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = templates.data ?? [];

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error('Give the template a name.');
    setBusy(true);
    const payload = {
      name: editing.name.trim(),
      subject: editing.subject,
      body: editing.body,
      isDefault: editing.isDefault ?? list.length === 0,
    };
    const res = editing.id !== undefined ? await updateTemplate(editing.id, payload) : await createTemplate(payload);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.isDefault ? 'Template saved. It is now the one every email starts from.' : 'Template saved.');
    setEditing(null);
    void templates.reload();
  };

  const remove = async (t: EmailTemplate) => {
    const res = await deleteTemplate(t.id);
    if (!res.ok) return toast.error(res.error);
    toast.info(`Deleted “${t.name}”.`);
    void templates.reload();
  };

  const makeDefault = async (t: EmailTemplate) => {
    const res = await updateTemplate(t.id, { isDefault: true });
    if (!res.ok) return toast.error(res.error);
    void templates.reload();
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const m = text.match(/^\s*subject:\s*(.+)\r?\n/i);
      setEditing({
        name: file.name.replace(/\.[^.]+$/, ''),
        subject: m ? m[1].trim() : '',
        body: (m ? text.slice(m[0].length) : text).trim(),
        isDefault: list.length === 0,
      });
    };
    reader.readAsText(file);
  };

  return (
    <section className="panel settings-panel" aria-labelledby="sec-templates">
      <h2 id="sec-templates" className="section-title">
        Email templates
      </h2>
      <p className="panel-note">
        The default template is the starting point for every email. With an AI key, each email is personalised from
        it using what was learned about the company.
      </p>

      {templates.loading ? (
        <Skeleton rows={2} height={44} />
      ) : templates.error && !templates.data ? (
        <LoadError message={templates.error} onRetry={() => void templates.reload()} />
      ) : list.length === 0 ? (
        <EmptyState title="No template yet">A built-in email is used until you write your own.</EmptyState>
      ) : (
        <ul className="tpl-list">
          {list.map((t) => (
            <li className="tpl-row" key={t.id}>
              <div>
                <strong>
                  {t.name} {t.isDefault && <Chip tone="success">Default</Chip>}
                </strong>
                <small className="dim">{t.subject || '(no subject)'}</small>
              </div>
              <div className="tpl-actions">
                {!t.isDefault && (
                  <button className="btn btn-ghost btn-sm" onClick={() => void makeDefault(t)}>
                    Make default
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => setEditing({ ...t })}>
                  Edit
                </button>
                <ConfirmButton className="btn btn-ghost btn-sm" confirmLabel="Delete?" onConfirm={() => void remove(t)}>
                  Delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="settings-row">
        <button className="btn btn-primary" onClick={() => setEditing({ name: '', subject: '', body: '', isDefault: list.length === 0 })}>
          New template
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Upload a file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.html,.htm"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>

      {editing && (
        <Modal
          wide
          title={editing.id !== undefined ? 'Edit template' : 'New template'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save template'}
              </button>
            </>
          }
        >
          <div className="settings-grid">
            <Field label="Template name">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. First hello"
                data-autofocus
              />
            </Field>
            <Field label="Subject line">
              <input
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                placeholder="Quick idea for {{company}}"
              />
            </Field>
          </div>
          <Field label="Message">
            <textarea
              rows={12}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder={'Hi {{company}} team,\n\n…'}
            />
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={editing.isDefault ?? false}
              onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
            />
            Use as the default template
          </label>
          <details className="placeholder-help">
            <summary>Words that fill in automatically</summary>
            <ul>
              {PLACEHOLDERS.map(([code, meaning]) => (
                <li key={code}>
                  <code>{code}</code> {meaning}
                </li>
              ))}
            </ul>
          </details>
        </Modal>
      )}
    </section>
  );
}
