/**
 * Inline preview of an email — the "view" for a template or step.
 *
 * Renders with sample personalization so {{first_name}} etc. show filled. HTML
 * bodies render in a sandboxed iframe (no scripts, isolated styles); plain text
 * renders as pre-wrapped text. Pure + dialog-free so it can be embedded inside
 * other dialogs without focus-trap conflicts.
 */
const SAMPLE: Record<string, string> = {
  first_name: 'Alex',
  name: 'Alex Rivera',
  company: 'Acme Inc',
  title: 'Head of Growth',
  sender_name: 'You',
  email: 'alex@acme.com',
};

function fillSample(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, k: string) =>
    SAMPLE[k.toLowerCase()] ?? '',
  );
}

export interface EmailPreviewProps {
  subject: string;
  body: string;
  isHtml: boolean;
}

export function EmailPreview({ subject, body, isHtml }: EmailPreviewProps) {
  const filledSubject = fillSample(subject || '(no subject)');
  const filledBody = fillSample(body || '');

  return (
    <div className="overflow-hidden rounded-xl border border-border-muted bg-surface">
      <div className="border-b border-border-muted bg-surface-2/50 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-faint">
          Subject
        </p>
        <p className="truncate text-sm font-medium text-text">{filledSubject}</p>
      </div>
      <div className="px-1 py-1">
        {isHtml ? (
          <iframe
            title="Email preview"
            sandbox=""
            className="h-80 w-full rounded-lg bg-white"
            srcDoc={filledBody}
          />
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-2 font-sans text-sm leading-relaxed text-text">
            {filledBody || '(empty body)'}
          </pre>
        )}
      </div>
      <p className="border-t border-border-muted px-4 py-1.5 text-[10px] text-text-faint">
        Preview with sample data — real sends use each lead's details.
      </p>
    </div>
  );
}
