/**
 * "Format" in a dialog — the sidebar's way in (components/FormatCard's
 * FormatButton), for every role in both apps.
 *
 * It is drawn at the root of the page on purpose. The sidebar is a glass
 * panel (`backdrop-filter`), and such a panel is the box its fixed-position
 * children are placed against: a dialog rendered inside it would be squeezed
 * into the rail. Through a portal it covers the whole window.
 */
import { createPortal } from 'react-dom';
import { Modal } from './overlay';
import { FormatCard } from './FormatCard';
import type { Preferences } from '../lib/format';

export function FormatDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (saved: Preferences) => void }) {
  return createPortal(
    <Modal
      title="Format"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        How dates, numbers and times look on your screens. It applies at once, everywhere you are signed in.
      </p>
      <FormatCard onSaved={onSaved} />
    </Modal>,
    document.body,
  );
}
