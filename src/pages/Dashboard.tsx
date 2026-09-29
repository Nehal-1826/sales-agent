import { CrmBoard } from '../components/CrmBoard';
import { LeadsGeo } from '../components/LeadsGeo';
import { CHAT_INITIAL } from '../lib/mockData';
import { IconChat, IconSend } from '../components/icons';
import type { PageKey } from '../lib/types';

/**
 * Dashboard — data-first view:
 *   LEADS · REGION (sortable state/country table)
 *   CRM (LEADS · POTENTIAL · REPLY)
 *   CHAT (preview — full interface on the Chat page)
 * The autonomous pipeline view lives on its own Pipeline menu item.
 */
export function Dashboard({ onNavigate, live }: { onNavigate: (p: PageKey) => void; live: boolean }) {
  const lastAi = CHAT_INITIAL[0];

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <span className="section-label">LEADS · REGION</span>
          <button className="link-btn" onClick={() => onNavigate('crm')}>
            Open CRM →
          </button>
        </div>
        <p className="panel-note">
          Every lead with its state + country — click a column header to sort, use the
          dropdowns to filter state/country wise (same controls as the Django Admin).
        </p>
        <LeadsGeo />
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="section-label">CRM</span>
          <button className="link-btn" onClick={() => onNavigate('crm')}>
            Open CRM →
          </button>
        </div>
        <CrmBoard compact />
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="section-label">CHAT</span>
          <button className="link-btn" onClick={() => onNavigate('chat')}>
            Open Chat →
          </button>
        </div>
        <div className="chat-preview">
          <div className="chat-preview-msg ai">
            <span className="who">Responder</span>
            <p>{lastAi.text}</p>
          </div>
          <div className="chat-preview-input" onClick={() => onNavigate('chat')}>
            <span>Message the Responder…</span>
            <IconSend size={15} />
          </div>
        </div>
        <p className="panel-note">
          <IconChat size={13} /> Dedicated chat interface with the Responder (Chatbot) — {live ? 'answers from the backend' : 'mock responses, backend not running'}.
        </p>
      </section>
    </div>
  );
}
