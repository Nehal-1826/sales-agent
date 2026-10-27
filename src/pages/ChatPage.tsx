import { useEffect, useRef, useState } from 'react';
import { LoadError, Skeleton } from '../components/feedback';
import { IconBot, IconSend, IconUser } from '../components/icons';
import { ConfirmButton } from '../components/overlay';
import { clearChat, getChatHistory, getOnboarding, isDemo, sendChatMessage } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useWorkspaceStatus } from '../lib/status';
import type { ChatMessage, OnboardingState } from '../lib/types';

/** One-tap requests — sent as your message; risky ones ask "yes/no" first. */
const QUICK = [
  'What needs my approval?',
  'Show me the latest leads',
  'Find new leads now',
  'Approve all drafts',
  'Send the daily report',
  'Pause the runs',
];

interface Bubble extends ChatMessage {
  error?: boolean;
  retryText?: string;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * ASSISTANT — chat that can act. On a fresh workspace it IS the setup
 * wizard: plain-language answers configure the system as you go.
 */
export function ChatPage() {
  const status = useWorkspaceStatus();
  const history = useAsync(getChatHistory);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // seed the conversation from history (or the wizard's first question)
  useEffect(() => {
    if (!history.data) return;
    setOnboarding(history.data.onboarding);
    setPending(history.data.pendingAction);
    if (history.data.messages.length > 0) setMessages(history.data.messages);
    else if (history.data.onboarding?.needed && history.data.onboarding.question)
      setMessages([{ id: -1, from: 'ai', text: history.data.onboarding.question, time: now() }]);
    else setMessages([{ id: -1, from: 'ai', text: welcome(), time: now() }]);
  }, [history.data]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setInput('');
    setPending(null);
    setMessages((m) => [...m, { id: Date.now(), from: 'user', text, time: now() }]);
    setTyping(true);
    const res = await sendChatMessage(text);
    setTyping(false);
    if (!res.ok) {
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, from: 'ai', text: `${res.error} If you asked me to do something, it may still be running.`, time: now(), error: true, retryText: text },
      ]);
      return;
    }
    setMessages((m) => [...m, res.data.reply]);
    setOnboarding(res.data.onboarding);
    setPending(res.data.pendingAction);
    void status.refresh();
    inputRef.current?.focus();
  };

  const clear = async () => {
    const res = await clearChat();
    if (!res.ok) return;
    setPending(null);
    const state = await getOnboarding().catch(() => null);
    setOnboarding(state);
    setMessages([
      { id: -1, from: 'ai', text: state?.needed && state.question ? state.question : welcome(), time: now() },
    ]);
  };

  /** Ideal-client file during setup — read as text and sent as the answer. */
  const onFile = (file: File) => {
    if (file.size > 300_000) {
      setMessages((m) => [...m, { id: Date.now(), from: 'ai', text: 'That file is too big. Keep it under 300 KB, or paste the important part.', time: now(), error: true }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void send(`📎 ${file.name}\n${String(reader.result ?? '')}`);
    reader.readAsText(file);
  };

  const inSetup = !!onboarding?.needed;
  const step = onboarding ? Math.min(onboarding.stepIndex + 1, onboarding.stepCount) : 0;

  return (
    <div className="page chat-page">
      <div className="chat-shell panel">
        <header className="chat-head">
          <span className="agent-icon">
            <IconBot size={18} />
          </span>
          <div className="chat-head-text">
            <strong>{inSetup ? 'Let’s set up your assistant' : 'Assistant'}</strong>
            <small>
              {inSetup
                ? 'Answer in your own words. Say “skip setup” to do it later in Settings.'
                : 'Ask about your leads, or tell it what to do. It checks with you before anything risky.'}
            </small>
          </div>
          {!inSetup && (
            <ConfirmButton className="btn btn-ghost btn-sm" confirmLabel="Clear conversation?" onConfirm={() => void clear()}>
              Clear
            </ConfirmButton>
          )}
        </header>

        {inSetup && onboarding && (
          <div className="setup-progress" aria-label={`Setup step ${step} of ${onboarding.stepCount}`}>
            <span className="setup-progress-label">
              Step {step} of {onboarding.stepCount}
            </span>
            <div className="progress" aria-hidden>
              <span style={{ width: `${(step / onboarding.stepCount) * 100}%` }} />
            </div>
          </div>
        )}

        {history.loading ? (
          <div className="chat-scroll">
            <Skeleton rows={3} height={40} />
          </div>
        ) : history.error && !history.data ? (
          <div className="chat-scroll">
            <LoadError message={history.error} onRetry={() => void history.reload()} />
          </div>
        ) : (
          <div className="chat-scroll" ref={scroller} role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.from}${m.error ? ' error' : ''}`}>
                <span className="chat-avatar" aria-hidden>
                  {m.from === 'ai' ? <IconBot size={14} /> : <IconUser size={14} />}
                </span>
                <div className="chat-bubble">
                  <p>{m.text}</p>
                  <span className="time">
                    {m.from === 'ai' ? 'Assistant' : 'You'} · {m.time}
                  </span>
                  {m.retryText && (
                    <button className="btn btn-sm" onClick={() => void send(m.retryText)}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="chat-msg ai">
                <span className="chat-avatar" aria-hidden>
                  <IconBot size={14} />
                </span>
                <div className="chat-bubble typing" aria-label="Assistant is typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
          </div>
        )}

        {pending && !typing && (
          <div className="chat-confirm" role="group" aria-label="Confirm action">
            <span>{pending}</span>
            <button className="btn btn-primary btn-sm" onClick={() => void send('yes')}>
              Yes, do it
            </button>
            <button className="btn btn-sm" onClick={() => void send('no')}>
              No, cancel
            </button>
          </div>
        )}

        {!inSetup && !pending && (
          <div className="chat-quick-row" role="toolbar" aria-label="Quick requests">
            {QUICK.map((q) => (
              <button key={q} className="chip chat-quick-chip" onClick={() => void send(q)} disabled={typing || isDemo()}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {inSetup && onboarding?.stepKey === 'icp' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
                Attach file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.csv,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onFile(file);
                }}
              />
            </>
          )}
          <input
            ref={inputRef}
            value={input}
            placeholder={inSetup ? 'Type your answer…' : 'Ask anything, or say what to do…'}
            onChange={(e) => setInput(e.target.value)}
            // don't send mid-composition (Tamil / other IME input)
            onKeyDown={(e) => e.nativeEvent.isComposing && e.key === 'Enter' && e.preventDefault()}
            aria-label="Message"
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit" disabled={!input.trim() || typing}>
            <IconSend size={15} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}

function welcome(): string {
  return isDemo()
    ? 'This is the offline demo. Answers are simulated.'
    : 'Hi! Ask me what needs your approval, show the latest leads, or tell me to find new ones.';
}
