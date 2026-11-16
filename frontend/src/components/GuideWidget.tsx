import { useEffect, useRef, useState } from 'react';
import { askGuide } from '../lib/api';
import { resumeTour } from '../lib/tutor';
import { AnimatedList } from './AnimatedList';
import { IconBot, IconSend, IconSpark } from './icons';
import { Strands } from './Strands';
import { ThoughtLine, useThoughtProgress } from './ThoughtLine';
import { VoicePill, useVoiceDictation } from './VoicePill';

interface GuideMsg {
  from: 'user' | 'ai';
  text: string;
  error?: boolean;
  thoughtSeconds?: number;
  thoughtSteps?: string[];
}

const SUGGESTIONS = [
  'How do I get my first leads?',
  'How do I send the emails?',
  'What should I set up first?',
  'How do email templates work?',
];

const GUIDE_STEPS = ['Reading your question', 'Checking workspace state', 'Writing clear steps'] as const;

// Mapped across Strands' 7 color roles using WarmPulse's orange + warm-white palette:
// [top edge, upper orange, amber, warm-white core, inner lower, mid lower, deep edge]
const HELP_ORB_COLORS = [
  '#c2410c', // --accent-strong
  '#ea580c', // vibrant orange
  '#fb923c', // --accent-chrome
  '#fff6ee', // warm-white core
  '#fdba74', // warm apricot highlight
  '#f97316', // --accent
  '#9a3412', // --accent-ink
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
  const voice = useVoiceDictation({ value: input, onChange: setInput, append: true });
  const liveSteps = useThoughtProgress(thinking, GUIDE_STEPS);
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
    const startedAt = performance.now();
    const res = await askGuide(q, prior);
    const elapsed = Math.max(0.1, (performance.now() - startedAt) / 1000);
    setThinking(false);
    setMessages((m) => [
      ...m,
      res.ok
        ? { from: 'ai', text: res.data, thoughtSeconds: elapsed, thoughtSteps: [...GUIDE_STEPS] }
        : { from: 'ai', text: res.error, error: true },
    ]);
  };

  return (
    <>
      <button
        type="button"
        className={`guide-fab${open ? ' hide' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open help"
        title="Help: ask how to do anything"
      >
        <Strands
          colors={HELP_ORB_COLORS}
          energy={0.75}
          amplitude={1.05}
          thickness={1.15}
          glow={1.1}
          intensity={1.1}
          saturation={0.9}
          glassSize={1.1}
          rim={1.15}
          dispersion={0.85}
          className="guide-fab-orb"
        />
        <span className="guide-fab-fallback" aria-hidden="true" />
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
            <button type="button" className="link-btn guide-resume" onClick={() => { resumeTour(); setOpen(false); }}>
              Resume tour
            </button>
            <button className="icon-btn guide-close" onClick={() => setOpen(false)} aria-label="Close help">
              ×
            </button>
          </header>

          <div className="guide-scroll" ref={scroller} role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="guide-suggest">
                <small>Try one of these:</small>
                <AnimatedList
                  items={SUGGESTIONS.map((s) => ({
                    id: s,
                    icon: <IconSpark size={15} />,
                    title: s,
                  }))}
                  onItemSelect={(item) => void ask(String(item.id ?? item.title))}
                  animation="slide"
                  theme="dark"
                  frame={false}
                  width="100%"
                  maxHeight="none"
                  showGradients={false}
                  gap={6}
                  radius={10}
                  accentColor="var(--accent)"
                />
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`guide-msg ${m.from}${m.error ? ' error' : ''}`}>
                {m.from === 'ai' && m.thoughtSteps && m.thoughtSeconds != null && (
                  <ThoughtLine
                    className="guide-thought-settled"
                    working={false}
                    elapsed={m.thoughtSeconds}
                    steps={m.thoughtSteps}
                    collapseOnSettle
                    color="var(--text-2)"
                    glyphColor="var(--accent-strong)"
                    fontSize={12}
                    showTimer
                  />
                )}
                <p>{m.text}</p>
              </div>
            ))}
            {thinking && (
              <div className="guide-msg ai guide-msg-thought">
                <ThoughtLine
                  working
                  label="Thinking…"
                  steps={liveSteps}
                  color="var(--text)"
                  glyphColor="var(--accent-strong)"
                  fontSize={13.5}
                  showTimer
                />
              </div>
            )}
          </div>

          <form
            className="guide-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <div className="search-voice-wrap">
              <input
                ref={inputRef}
                value={input}
                placeholder="How do I…?"
                onChange={(e) => setInput(e.target.value)}
                aria-label="Ask a question"
              />
              <VoicePill
                size={26}
                mode="toggle"
                disabled={thinking}
                ariaLabel="Speak question"
                onStart={voice.onStart}
                onStop={voice.onStop}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={!input.trim() || thinking} aria-label="Ask">
              <IconSend size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
