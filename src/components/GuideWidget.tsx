import { useEffect, useRef, useState } from 'react';
import { askGuide } from '../lib/api';
import { IconBot, IconSend } from './icons';

interface GuideMsg {
  from: 'user' | 'ai';
  text: string;
}

const SUGGESTIONS = [
  'How do I get my first leads?',
  'How do I send cold emails?',
  'What should I configure first?',
  'How do email templates work?',
];

/**
 * GUIDE — floating AI assistant (Gemini) that answers "how do I use this
 * product?" on any page, aware of the workspace's live configuration.
 */
export function GuideWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GuideMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setOpen(true);
    setInput('');
    const prior = messages; // so "do it yourself" can resolve to the last suggestion
    setMessages((m) => [...m, { from: 'user', text: q }]);
    setThinking(true);
    const answer = await askGuide(q, prior);
    setThinking(false);
    setMessages((m) => [...m, { from: 'ai', text: answer }]);
  };

  return (
    <>
      <button
        className={`guide-fab${open ? ' hide' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open the AI guide"
        title="AI guide — ask how to use anything"
      >
        ?
      </button>

      {open && (
        <div className="guide-panel panel">
          <header className="guide-head">
            <span className="agent-icon">
              <IconBot size={16} />
            </span>
            <div>
              <strong>AI Guide</strong>
              <small>Ask anything — I can also run actions for you</small>
            </div>
            <button className="btn btn-ghost guide-close" onClick={() => setOpen(false)} aria-label="Close guide">
              ✕
            </button>
          </header>

          <div className="guide-scroll" ref={scroller}>
            {messages.length === 0 && (
              <div className="guide-suggest">
                <small>Try one of these:</small>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn btn-ghost" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`guide-msg ${m.from}`}>
                <p>{m.text}</p>
              </div>
            ))}
            {thinking && <div className="guide-msg ai typing">…</div>}
          </div>

          <div className="guide-input">
            <input
              value={input}
              placeholder="How do I…?"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(input)}
              aria-label="Ask the guide"
            />
            <button className="btn btn-primary" onClick={() => ask(input)} disabled={!input.trim() || thinking}>
              <IconSend size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
