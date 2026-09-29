import { useEffect, useRef, useState } from 'react';
import { AGENT_LABELS, DEFAULT_AGENT_CONFIGS, MODEL_OPTIONS } from '../lib/mockData';
import { getAgentConfig, putAgentConfig } from '../lib/api';
import { loadJson, saveJson } from '../lib/store';
import { Field, PageHeader, SectionLabel, Spinner } from '../components/ui';
import { iconForAgent } from '../components/icons';
import type { AgentConfig, AgentKey } from '../lib/types';

const STORE_KEY = 'agent-configs';

/**
 * AGENTS — configuration interface from the notes.
 * One UI for every agent (Search / Profile / Copywright / Responder):
 *   DB · API · SYSTEM PROMPTS · NEGATIVE · MODEL
 * Saves to the backend when Django is running, localStorage otherwise.
 */
export function AgentsPage() {
  const [agent, setAgent] = useState<AgentKey>('search');
  const [configs, setConfigs] = useState<Record<AgentKey, AgentConfig>>(() =>
    loadJson(STORE_KEY, DEFAULT_AGENT_CONFIGS),
  );
  const [saved, setSaved] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const loadedFromBackend = useRef(new Set<AgentKey>());

  // load the selected agent's config from the backend (once per agent)
  useEffect(() => {
    if (loadedFromBackend.current.has(agent)) return;
    loadedFromBackend.current.add(agent);
    setLoadingConfig(true);
    getAgentConfig(agent).then((cfg) => {
      if (cfg) {
        setConfigs((prev) => ({ ...prev, [agent]: { ...cfg, db: cfg.db, api: cfg.api } }));
      }
      setLoadingConfig(false);
    });
  }, [agent]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const config = configs[agent];
  const Icon = iconForAgent[agent];

  const patch = (p: Partial<AgentConfig>) =>
    setConfigs((prev) => ({ ...prev, [agent]: { ...prev[agent], ...p } }));

  const patchDb = (p: Partial<AgentConfig['db']>) =>
    patch({ db: { ...config.db, ...p } });
  const patchApi = (p: Partial<AgentConfig['api']>) =>
    patch({ api: { ...config.api, ...p } });

  const save = async () => {
    saveJson(STORE_KEY, configs); // offline copy
    const live = await putAgentConfig(agent, config);
    setSaved(true);
    if (!live) {
      // mark configs as needing reload next time the backend appears
      loadedFromBackend.current.delete(agent);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Agents"
        subtitle="Configure the agents of the autonomous pipeline. The same settings apply to every agent."
        actions={
          <button className="btn btn-primary" onClick={save}>
            {saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        }
      />

      <div className="agents-layout">
        <div className="panel agent-picker">
          <SectionLabel>Select Agent</SectionLabel>
          <div className="agent-picker-list">
            {(Object.keys(AGENT_LABELS) as AgentKey[]).map((key) => {
              const PickerIcon = iconForAgent[key];
              return (
                <button
                  key={key}
                  className={`agent-picker-item${agent === key ? ' active' : ''}`}
                  onClick={() => setAgent(key)}
                  aria-pressed={agent === key}
                >
                  <PickerIcon size={16} />
                  <span>{AGENT_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
          <p className="panel-note">
            Selected: <strong>{AGENT_LABELS[agent]}</strong> — saved to the backend when live, locally otherwise.
          </p>
        </div>

        <div className="agent-config">
          <div className="panel config-banner">
            <span className="agent-icon lg">
              <Icon size={20} />
            </span>
            <div>
              <strong>{AGENT_LABELS[agent]}</strong>
              <small>DB · API · System prompts · Negative · Model</small>
            </div>
          </div>

          {loadingConfig ? (
            <Spinner label="Loading agent configuration…" />
          ) : (
          <>
          <div className="config-grid">
            <section className="panel config-panel">
              <SectionLabel>DB</SectionLabel>
              <Field label="Provider">
                <select
                  value={config.db.provider}
                  onChange={(e) => patchDb({ provider: e.target.value as AgentConfig['db']['provider'] })}
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mongodb">MongoDB</option>
                </select>
              </Field>
              <Field label="Database / collection">
                <input value={config.db.name} onChange={(e) => patchDb({ name: e.target.value })} />
              </Field>
              <Field label="Connection string" hint="Served by the backend — nothing connects from the browser.">
                <input
                  className="mono"
                  value={config.db.connection}
                  onChange={(e) => patchDb({ connection: e.target.value })}
                />
              </Field>
            </section>

            <section className="panel config-panel">
              <SectionLabel>API</SectionLabel>
              <Field label="Endpoint URL">
                <input className="mono" value={config.api.url} onChange={(e) => patchApi({ url: e.target.value })} />
              </Field>
              <Field label="Auth header / key">
                <input className="mono" value={config.api.auth} onChange={(e) => patchApi({ auth: e.target.value })} />
              </Field>
              <Field label="Status">
                <div className="static-input">
                  <span className="status-dot dot-gray" /> Stored on the backend when live
                </div>
              </Field>
            </section>
          </div>

          <section className="panel config-panel">
            <SectionLabel>System Prompts</SectionLabel>
            <textarea
              className="prompt-editor"
              rows={9}
              value={config.systemPrompt}
              onChange={(e) => patch({ systemPrompt: e.target.value })}
            />
          </section>

          <section className="panel config-panel">
            <SectionLabel>Negative</SectionLabel>
            <textarea
              className="prompt-editor negative"
              rows={7}
              value={config.negativePrompt}
              onChange={(e) => patch({ negativePrompt: e.target.value })}
            />
          </section>

          <section className="panel config-panel">
            <SectionLabel>Model</SectionLabel>
            <Field label="Model selector">
              <select value={config.model} onChange={(e) => patch({ model: e.target.value })}>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <div className="config-save">
            <button className="btn btn-primary" onClick={save}>
              {saved ? 'Saved ✓' : 'Save Changes'}
            </button>
            <small>{saved ? 'Configuration saved.' : 'Saved to Django when live — localStorage otherwise.'}</small>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
