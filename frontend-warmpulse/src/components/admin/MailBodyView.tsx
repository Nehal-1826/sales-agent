import { useEffect, useRef, useState } from 'react';

interface MailBodyViewProps {
  /** Sanitized HTML part from the backend — rendered like the original. */
  html?: string | null;
  /** Plain-text part — fallback when the mail has no HTML. */
  text?: string | null;
  /** Class for the HTML iframe (width/min-height; height auto-grows to content). */
  htmlClassName?: string;
  /** Class for the plain-text fallback block. */
  textClassName?: string;
}

/**
 * Message body rendered "like the original" mail client: the mail's HTML part
 * in a sandboxed iframe. `sandbox="allow-same-origin"` (deliberately WITHOUT
 * allow-scripts) keeps script execution disabled — escaping a sandboxed frame
 * requires both flags together, and the server-side sanitizer strips active
 * content regardless. Inheriting our origin lets the parent measure the
 * document and auto-grow the frame to the mail's full height (a ResizeObserver
 * on the body also catches late-loading images), so the reading pane scrolls
 * as one page, Gmail-style, with no nested inner scrollbar.
 */
export function MailBodyView({
  html,
  text,
  htmlClassName = 'w-full min-h-[280px] border-0 bg-white',
  textClassName = 'whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text',
}: MailBodyViewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const handleLoad = () => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const body = doc?.body;
    // If measuring ever fails (doc not ready / cross-origin), the class
    // min-height keeps the frame usable with its internal scrollbar.
    if (!frame || !doc || !body) return;
    const measure = () => {
      const h = Math.max(doc.documentElement?.scrollHeight ?? 0, body.scrollHeight ?? 0);
      if (h > 0) {
        const next = Math.min(h + 16, 40000);
        setHeight((prev) => (prev === next ? prev : next));
      }
    };
    measure();
    observerRef.current?.disconnect();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    observerRef.current = ro;
  };

  // Reset the measured height when a different mail is loaded into the frame.
  useEffect(() => {
    setHeight(null);
  }, [html]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  if (html) {
    return (
      <iframe
        ref={frameRef}
        title="Message body"
        sandbox="allow-same-origin"
        srcDoc={html}
        className={htmlClassName}
        style={height != null ? { height: `${height}px` } : undefined}
        onLoad={handleLoad}
      />
    );
  }
  return <div className={textClassName}>{text || '(empty body)'}</div>;
}
