import { Skeleton } from '../../components/feedback';
import { WEBMAIL_FOLDERS, type WebmailFolder, type WebmailFolderName } from '../../lib/webmail';

/* Folder glyphs — tiny inline strokes, mail-client conventions. */
const FolderIcon = ({ name, size = 17 }: { name: WebmailFolderName; size?: number }) => {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'INBOX')
    return (
      <svg {...p}>
        <path d="M4 13.5 6.2 5.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z" />
        <path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20" />
      </svg>
    );
  if (name === 'Sent')
    return (
      <svg {...p}>
        <path d="M4 11.5 20 4l-7.5 16-2-6.5L4 11.5Z" />
      </svg>
    );
  if (name === 'Drafts')
    return (
      <svg {...p}>
        <path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" />
        <path d="m12.5 7.5 4 4" />
      </svg>
    );
  if (name === 'Junk')
    return (
      <svg {...p}>
        <path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 16.5h.01" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M4 7h6l1.6 2H20v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7Z" />
      <path d="m9.5 13 2 2 4-4" />
    </svg>
  );
};

/**
 * Left rail: prominent Compose button + the five IMAP folders with live
 * counts (unread count bold in accent). Falls back to skeleton rows while
 * the folder list loads, and to zero counts when it failed.
 */
export function FolderRail({
  folders,
  active,
  loading,
  onSelect,
  onCompose,
}: {
  folders: WebmailFolder[] | null;
  active: WebmailFolderName;
  loading: boolean;
  onSelect: (folder: WebmailFolderName) => void;
  onCompose: () => void;
}) {
  const byName = new Map((folders ?? []).map((f) => [f.name, f]));
  return (
    <nav className="wm-rail" aria-label="Mail folders">
      <button type="button" className="btn btn-primary wm-compose" onClick={onCompose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Compose
      </button>
      {loading && !folders ? (
        <Skeleton rows={5} height={34} />
      ) : (
        <ul className="wm-folders">
          {WEBMAIL_FOLDERS.map((name) => {
            const f = byName.get(name);
            const unread = f?.unread ?? 0;
            return (
              <li key={name}>
                <button
                  type="button"
                  className={`wm-folder${active === name ? ' active' : ''}`}
                  onClick={() => onSelect(name)}
                  aria-current={active === name ? 'true' : undefined}
                >
                  <FolderIcon name={name} />
                  <span className="wm-folder-name">{name === 'INBOX' ? 'Inbox' : name}</span>
                  {unread > 0 ? (
                    <span className="wm-folder-count unread">{unread}</span>
                  ) : (
                    (f?.count ?? 0) > 0 && <span className="wm-folder-count">{f?.count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
