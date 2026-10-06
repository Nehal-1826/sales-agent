import { useState } from 'react';
import { PipelineFlow } from '../components/PipelineFlow';
import { StatusStrip } from '../components/StatusStrip';
import { AutopilotPanel } from '../components/AutopilotPanel';
import { AgentsPage } from './AgentsPage';
import { CrmPage } from './CrmPage';
import { LeadsPage } from './LeadsPage';
import { ChatPage } from './ChatPage';
import type { PipelineTab } from '../lib/types';

const TABS: { key: PipelineTab; label: string }[] = [
  { key: 'flow', label: 'Orchestrator Flow' },
  { key: 'agents', label: 'Agents' },
  { key: 'leads', label: 'Leads & Reports' },
  { key: 'crm', label: 'CRM' },
  { key: 'chat', label: 'Chat' },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

/** Initial tab from the location hash — Dashboard deep-links via `#pipeline/<tab>`. */
function initialTab(): PipelineTab {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const tab = hash.startsWith('pipeline/') ? hash.slice('pipeline/'.length) : '';
  return TAB_KEYS.has(tab) ? (tab as PipelineTab) : 'flow';
}

/**
 * PIPELINE — everything between Dashboard and Settings lives here as tabs:
 *   Orchestrator flow · Agents · Leads & Reports · CRM · Chat
 */
export function PipelinePage({ live }: { live: boolean }) {
  const [tab, setTab] = useState<PipelineTab>(initialTab);

  return (
    <div className="page">
      <nav className="subtabs" aria-label="Pipeline sections">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`subtab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'flow' && (
        <>
          <PipelineFlow live={live} />
          <StatusStrip live={live} />
          <AutopilotPanel />
        </>
      )}
      {tab === 'agents' && <AgentsPage />}
      {tab === 'leads' && <LeadsPage />}
      {tab === 'crm' && <CrmPage />}
      {tab === 'chat' && <ChatPage />}
    </div>
  );
}
