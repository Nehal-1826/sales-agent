import { useEffect, useRef, useState } from 'react';
import { askGuide } from '../lib/api';
import { IconBot, IconSend } from './icons';

interface GuideMsg {
  from: 'user' | 'ai';
  text: string;
  error?: boolean;
}

const SUGGESTIONS = [
  'How do I get my first leads?',
  'How do I send the emails?',
  'What should I set up first?',
  'How do email templates work?',
];

/**
 * HELP — floating guide on every page except the Assistant: answers
 * "how do I…?" from the product knowledge base + the live workspace state.
 */
export function GuideWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GuideMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setOpen(true);
    setInput('');
    const prior = messages.filter((m) => !m.error);
    setMessages((m) => [...m, { from: 'user', text: q }]);
    setThinking(true);
    const res = await askGuide(q, prior);
    setThinking(false);
    setMessages((m) => [
      ...m,
      res.ok ? { from: 'ai', text: res.data } : { from: 'ai', text: res.error, error: true },
    ]);
  };

  return (
    <>
      <button
        className={`guide-fab${open ? ' hide' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open help"
        title="Help: ask how to do anything"
      >
        ?
      </button>

      {open && (
        <div className="guide-panel panel" role="dialog" aria-label="Help">
          <header className="guide-head">
            <span className="agent-icon">
              <IconBot size={16} />
            </span>
            <div>
              <strong>Help</strong>
              <small>Ask how to do anything in the app</small>
            </div>
            <button className="icon-btn guide-close" onClick={() => setOpen(false)} aria-label="Close help">
              ×
            </button>
          </header>

          <div className="guide-scroll" ref={scroller} role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="guide-suggest">
                <small>Try one of these:</small>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn btn-ghost" onClick={() => void ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`guide-msg ${m.from}${m.error ? ' error' : ''}`}>
                <p>{m.text}</p>
              </div>
            ))}
            {thinking && <div className="guide-msg ai typing">Thinking…</div>}
          </div>

          <form
            className="guide-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              placeholder="How do I…?"
              onChange={(e) => setInput(e.target.value)}
              aria-label="Ask a question"
            />
            <button className="btn btn-primary" type="submit" disabled={!input.trim() || thinking} aria-label="Ask">
              <IconSend size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
