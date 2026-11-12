import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { W7Hub } from './pro-workspace/W7Hub';
import './pro-workspace/pro-workspace.css';

/**
 * Standalone preview of the W7 (W5 + W6 fusion) Workspace page.
 * Same shell as the picker, but no tab strip — just the locked design.
 */
export function ProWorkspaceFinal() {
  return (
    <div className="pwp">
      <header className="pwp__topbar">
        <Link to="/client-design-preview/workspace/pro" className="pwp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Workspace picker
        </Link>
        <span className="pwp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Workspace · final design (W5 + W6 fusion)
        </span>
      </header>

      <section className="pwp__intro">
        <span className="pwp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 8 of 10 · Pro tier · locked
        </span>
        <h1 className="pwp__title">
          Pro <em>Workspace</em> — hub + member detail
        </h1>
        <p className="pwp__sub">
          Single page. Bento overview (Plan · Activity · API · Webhooks · Billing)
          stacked above a master-detail member workspace (rail + permissions +
          mailbox assignment + per-member audit). Admin tokens throughout.
        </p>
      </section>

      <div className="pwp__stage">
        <W7Hub />
      </div>
    </div>
  );
}

export default ProWorkspaceFinal;
