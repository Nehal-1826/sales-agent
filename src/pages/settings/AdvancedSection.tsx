import { useState } from 'react';
import { LoadError, Skeleton, toast } from '../../components/feedback';
import { Field } from '../../components/ui';
import { getAgentConfig, putAgentConfig, putSettings } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { MODEL_OPTIONS } from '../../lib/mockData';
import { AI_PROVIDERS } from '../../lib/targetingOptions';
import type { AgentConfig, AgentKey, SettingsState } from '../../lib/types';
import { SaveBar, useSectionForm } from './useSectionForm';

interface KeysForm {
  provider: string;
  apiKey: string; // blank = keep the stored key
  apolloApiKey: string;
  host: string;
  port: string;
  user: string;
  password: string; // blank = keep the stored password
  from: string;
}

/** Advanced — AI provider/key, enrichment key, manual mail server, agent prompts. */
export function AdvancedSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const storedKey = settings.aiKey.apiKey; // masked '••••abcd' or ''
  const storedApollo = settings.aiKey.apolloApiKey ?? '';
  const storedPassword = settings.smtp.password;
  const form = useSectionForm<KeysForm>(
    {
      provider: AI_PROVIDERS.find((p) => settings.aiKey.provider.toLowerCase().includes(p.split(' ')[0].toLowerCase())) ?? 'Gemini',
      apiKey: '',
      apolloApiKey: '',
      host: settings.smtp.host,
      port: String(settings.smtp.port || ''),
      user: settings.smtp.user,
      password: '',
      from: settings.smtp.from,
    },
    async (v) => {
      // secrets are only sent when typed — an empty box keeps the stored value
      const res = await putSettings({
        aiKey: { provider: v.provider, apiKey: v.apiKey, apolloApiKey: v.apolloApiKey },
        smtp: { host: v.host, port: v.port, user: v.user, password: v.password, from: v.from },
      });
      if (res.ok) onSaved(res.data);
      return res;
    },
  );
  const v = form.value;
  const set = (patch: Partial<KeysForm>) => form.setValue({ ...v, ...patch });
  const [showKey, setShowKey] = useState(false);

  return (
    <>
      <section className="panel settings-panel" aria-labelledby="sec-ai">
        <h2 id="sec-ai" className="section-title">
          AI
        </h2>
        <p className="panel-note">
          The AI reads each lead's website, writes the company summary and personalises every email. Without a key,
          your template is used as-is.
        </p>
        <div className="settings-grid">
          <Field label="AI provider">
            <select value={v.provider} onChange={(e) => set({ provider: e.target.value })}>
              {AI_PROVIDERS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="API key" hint={storedKey ? `Saved (${storedKey}). Leave blank to keep it.` : 'No key saved yet.'}>
            <span className="input-with-action">
              <input
                type={showKey ? 'text' : 'password'}
                value={v.apiKey}
                onChange={(e) => set({ apiKey: e.target.value })}
                placeholder={storedKey ? 'Type a new key to replace it' : 'Paste your key'}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey((s) => !s)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </span>
          </Field>
          <Field
            label="Apollo.io key (optional)"
            hint={storedApollo ? `Saved (${storedApollo}). Leave blank to keep it.` : 'Finds phone numbers when a website hides them.'}
          >
            <input
              type="password"
              value={v.apolloApiKey}
              onChange={(e) => set({ apolloApiKey: e.target.value })}
              autoComplete="off"
            />
          </Field>
        </div>
      </section>

      <section className="panel settings-panel" aria-labelledby="sec-smtp">
        <h2 id="sec-smtp" className="section-title">
          Mail server (manual)
        </h2>
        <p className="panel-note">Only needed if one-click connect in Email sending doesn't support your provider.</p>
        <div className="settings-grid">
          <Field label="Server">
            <input value={v.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.yourprovider.com" />
          </Field>
          <Field label="Port">
            <input value={v.port} onChange={(e) => set({ port: e.target.value })} inputMode="numeric" placeholder="587" />
          </Field>
          <Field label="Username">
            <input value={v.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Password" hint={storedPassword ? 'Saved. Leave blank to keep it.' : undefined}>
            <input type="password" value={v.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Send as (from address)">
            <input type="email" value={v.from} onChange={(e) => set({ from: e.target.value })} />
          </Field>
        </div>
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
      </section>

      <AgentPrompts />
    </>
  );
}

const AGENTS: { key: AgentKey; label: string; hint: string }[] = [
  { key: 'copywright', label: 'Email writer', hint: 'Instructions for writing every outreach email.' },
  { key: 'responder', label: 'Assistant replies', hint: 'How the Assistant chat talks to you.' },
];

/** Prompts + model for the two agents that actually read them. */
function AgentPrompts() {
  const [agent, setAgent] = useState<AgentKey>('copywright');
  const config = useAsync(() => getAgentConfig(agent), [agent]);
  return (
    <section className="panel settings-panel" aria-labelledby="sec-agents">
      <h2 id="sec-agents" className="section-title">
        AI instructions
      </h2>
      <div className="subtabs compact" role="tablist">
        {AGENTS.map((a) => (
          <button
            key={a.key}
            role="tab"
            aria-selected={agent === a.key}
            className={`subtab${agent === a.key ? ' active' : ''}`}
            onClick={() => setAgent(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="panel-note">{AGENTS.find((a) => a.key === agent)?.hint}</p>
      {config.loading ? (
        <Skeleton rows={3} height={60} />
      ) : config.error || !config.data ? (
        <LoadError message={config.error ?? 'Not available.'} onRetry={() => void config.reload()} />
      ) : (
        <AgentForm key={agent} agent={agent} initial={config.data} />
      )}
    </section>
  );
}

function AgentForm({ agent, initial }: { agent: AgentKey; initial: AgentConfig }) {
  const form = useSectionForm<AgentConfig>(initial, (c) => putAgentConfig(agent, c));
  const c = form.value;
  const custom = !MODEL_OPTIONS.includes(c.model);
  return (
    <>
      <Field label="Instructions">
        <textarea rows={6} value={c.systemPrompt} onChange={(e) => form.setValue({ ...c, systemPrompt: e.target.value })} />
      </Field>
      <Field label="Things to avoid">
        <textarea rows={3} value={c.negativePrompt} onChange={(e) => form.setValue({ ...c, negativePrompt: e.target.value })} />
      </Field>
      <Field label="Model" hint="If the model doesn't match your AI provider, the provider's default is used.">
        <input
          list={`models-${agent}`}
          value={custom && c.model === 'Custom' ? '' : c.model}
          onChange={(e) => form.setValue({ ...c, model: e.target.value })}
          placeholder="Provider default"
        />
        <datalist id={`models-${agent}`}>
          {MODEL_OPTIONS.filter((m) => m !== 'Custom').map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} onDiscard={form.discard} />
    </>
  );
}
