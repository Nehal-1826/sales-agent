import { Banner, EmptyState, Skeleton } from '../../components/feedback';
import { fmtDateTime } from '../../lib/format';
import type { WebmailMessageDetail } from '../../lib/webmail';

/** The reading pane — rendered HTML goes through a sandboxed iframe (same
 *  approach as ReportPanel: sandbox="" kills scripts and app-origin access).
 *  A CSP meta also blocks remote images: tracking pixels never auto-load.
 *  Plain-text messages render pre-wrapped. */
function MessageBody({ detail }: { detail: WebmailMessageDetail }) {
  if (detail.html) {
    const doc =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="img-src \'none\'; style-src \'unsafe-inline\'">' +
      '<style>' +
      'html,body,*{scrollbar-width:none;-ms-overflow-style:none}' +
      '::-webkit-scrollbar,*::-webkit-scrollbar{display:none;width:0;height:0}' +
      'body{margin:0;padding:18px;background:#fff;color:#1f1b16;' +
      'font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}' +
      'img{max-width:100%;height:auto}a{color:#c2410c}table{max-width:100%}' +
      '</style></head><body>' +
      detail.html +
      '</body></html>';
    return <iframe title={`Message body: ${detail.subject || '(no subject)'}`} className="wm-read-frame" srcDoc={doc} sandbox="" />;
  }
  return <pre className="wm-read-text">{detail.text}</pre>;
}

/** Right pane (desktop) / full-screen overlay (narrow screens): one message. */
export function ReadPane({
  detail,
  loading,
  error,
  onRetry,
  onClose,
  onReply,
  onMarkUnread,
  onTrash,
  busy,
}: {
  detail: WebmailMessageDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onReply: (detail: WebmailMessageDetail) => void;
  onMarkUnread: (detail: WebmailMessageDetail) => void;
  onTrash: (detail: WebmailMessageDetail) => void;
  busy: boolean;
}) {
  if (!detail && !loading && !error) {
    return (
      <section className="wm-read" aria-label="Reading pane">
        <EmptyState title="No message selected">
          Pick a message from the list to read it here.
        </EmptyState>
      </section>
    );
  }
  return (
    <section className="wm-read open" aria-label="Reading pane">
      {error ? (
        <div className="wm-read-pad">
          <Banner tone="error" title="Couldn't load this message"
            action={<button className="btn btn-sm" onClick={onRetry}>Try again</button>}>
            {error}
          </Banner>
        </div>
      ) : loading || !detail ? (
        <div className="wm-read-pad">
          <Skeleton rows={5} height={20} />
        </div>
      ) : (
        <>
          <header className="wm-read-head">
            <div className="wm-read-title">
              <h2>{detail.subject || '(no subject)'}</h2>
              <p>
                <strong>{detail.from}</strong> → {detail.to.join(', ')} · {fmtDateTime(detail.date, 'medium')}
              </p>
            </div>
            <div className="wm-read-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onReply(detail)} disabled={busy}>
                Reply
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onMarkUnread(detail)}
                disabled={busy}
                title="Mark as unread"
                aria-label="Mark as unread"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn wm-trash-btn"
                onClick={() => onTrash(detail)}
                disabled={busy}
                title="Move to Trash"
                aria-label="Move to Trash"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
                </svg>
              </button>
              <button type="button" className="icon-btn wm-read-close" onClick={onClose} title="Close" aria-label="Close message">
                ×
              </button>
            </div>
          </header>
          <MessageBody detail={detail} />
        </>
      )}
      {busy && (
        <div className="wm-read-busy" role="status">
          <span className="spinner" aria-hidden /> working…
        </div>
      )}
    </section>
  );
}
