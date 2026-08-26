interface MailBodyViewProps {
  /** Sanitized HTML part from the backend — rendered like the original. */
  html?: string | null;
  /** Plain-text part — fallback when the mail has no HTML. */
  text?: string | null;
  /** Class for the HTML iframe (needs an explicit height). */
  htmlClassName?: string;
  /** Class for the plain-text fallback block. */
  textClassName?: string;
}

/**
 * Message body rendered "like the original" mail client: the mail's HTML
 * part in a sandboxed iframe — sandbox="" disables scripts, forms, popups
 * and same-origin access, so active content cannot run even if some slipped
 * past the server-side sanitizer. Falls back to pre-wrapped plain text.
 */
export function MailBodyView({
  html,
  text,
  htmlClassName = 'h-full min-h-[320px] w-full rounded-lg border-0 bg-white',
  textClassName = 'whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text',
}: MailBodyViewProps) {
  if (html) {
    return (
      <iframe
        title="Message body"
        sandbox=""
        srcDoc={html}
        className={htmlClassName}
      />
    );
  }
  return <div className={textClassName}>{text || '(empty body)'}</div>;
}
