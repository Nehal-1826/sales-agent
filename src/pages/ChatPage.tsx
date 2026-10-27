import { useEffect, useRef, useState } from 'react';
import { clearChat, getChatHistory, getOnboarding, sendChatMessage } from '../lib/api';
import { CHAT_INITIAL } from '../lib/mockData';
import { IconBot, IconSend, IconUser } from '../components/icons';
import { Chip, Spinner } from '../components/ui';
import type { ChatMessage, OnboardingState } from '../lib/types';

const WELCOME: ChatMessage = {
  id: 0,
  from: 'ai',
  text: 'Vanakkam! 👋 Fresh chat — ask me anything about your leads, drafts or the pipeline.',
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function now(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** One-tap operations — tapping a chip sends it as the operator's message and
 *  the backend executes the real action (cycle, approvals, profiles, report). */
const QUICK_COMMANDS = [
  'Run a cycle',
  'What needs my approval?',
  'Approve all drafts',
  'Show me the latest leads',
  'Switch to the backup profile',
  'Send the daily report',
  'Pause the runs',
];

/**
 * CHAT — communication with the Responder (Chatbot).
 * Live answers from the backend when Django is running, local mock otherwise.
 *
 * On a fresh workspace the chat IS the setup wizard: the bot asks a handful
 * of plain-text questions (company, services, website, who to target,
 * optional AI key + mailbox) and every answer configures the live system.
 */
export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_INITIAL);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory().then((history) => {
      if (history && history.messages.length > 0) {
        setOnboarding(history.onboarding);
        setMessages(
          history.messages.map((m) => ({
            id: m.id,
            from: m.from,
            text: m.text,
            time: m.time || now(),
          })),
        );
      } else {
        // fresh chat on a fresh workspace — surface the wizard's first question
        getOnboarding().then((state) => {
          setOnboarding(state);
          if (state?.needed && state.question) {
            setMessages([
              { id: -1, from: 'ai', text: state.question, time: now() },
            ]);
          }
        });
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, onboarding]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setInput('');
    setMessages((m) => [...m, { id: Date.now(), from: 'user', text, time: now() }]);
    setTyping(true);

    const { reply, onboarding: state } = await sendChatMessage(text);
    setTyping(false);
    setMessages((m) => [...m, reply]);
    if (state !== undefined) setOnboarding(state);
  };

  const clear = async () => {
    await clearChat();
    setMessages([{ ...WELCOME, time: now() }]);
    const state = await getOnboarding();
    setOnboarding(state);
    if (state?.needed && state.question) {
      setMessages([{ id: -1, from: 'ai', text: state.question, time: now() }]);
    }
  };

  /** ICP file upload — read as text and send through the chat as the answer. */
  const onUploadIcp = (file: File) => {
    if (file.size > 300_000) {
      setMessages((m) => [
        ...m,
        { id: Date.now(), from: 'ai', text: 'That file is too large — keep it under 300 KB, or paste the important parts as a message.', time: now() },
      ]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => send(`📎 ${file.name}\n${String(reader.result ?? '')}`);
    reader.readAsText(file);
  };

  const inSetup = !!onboarding?.needed;
  const icpStep = inSetup && onboarding?.stepKey === 'icp';

  return (
    <div className="page chat-page">
      <div className="chat-shell panel">
        <header className="chat-head">
          <span className="agent-icon">
            <IconBot size={18} />
          </span>
          <div>
            <strong>{inSetup ? 'Setup Assistant' : 'Responder (Chatbot)'}</strong>
            <small>
              {inSetup
                ? 'Answer in plain text — every answer configures the system live'
                : 'Handles responses in the autonomous pipeline'}
            </small>
          </div>
          {inSetup ? (
            <Chip tone="accent">
              {onboarding?.progress || 'Setup'}
            </Chip>
          ) : (
            <span className="chip">Responder agent</span>
          )}
          <button className="btn btn-ghost chat-clear" onClick={clear} title="Clear the conversation">
            🗑 Clear
          </button>
        </header>

        {loading ? (
          <Spinner label="Loading chat history…" />
        ) : (
        <div className="chat-scroll" ref={scroller}>
          {inSetup && (
            <div className="chat-setup-note">
              You&apos;re 4–7 quick answers away from a fully configured machine — company,
              targeting, AI and email. Say <strong>“skip setup”</strong> anytime to do it later
              in Settings.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.from}`}>
              <span className="chat-avatar" aria-hidden>
                {m.from === 'ai' ? <IconBot size={14} /> : <IconUser size={14} />}
              </span>
              <div className="chat-bubble">
                <span className="who">{m.from === 'ai' ? (inSetup ? 'Setup Assistant' : 'Responder') : 'You'}</span>
                <p>{m.text}</p>
                <span className="time">{m.time}</span>
              </div>
            </div>
          ))}
          {typing && (
            <div className="chat-msg ai">
              <span className="chat-avatar" aria-hidden>
                <IconBot size={14} />
              </span>
              <div className="chat-bubble typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
        </div>
        )}

        <div className="chat-quick-row" role="toolbar" aria-label="Quick commands">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              className="chip chip-accent chat-quick-chip"
              onClick={() => send(cmd)}
              disabled={typing}
            >
              {cmd}
            </button>
          ))}
        </div>
        <div className="chat-input-row">
          {icpStep && (
            <label className="btn btn-ghost" title="Upload your Ideal Client Profile (txt / md / csv)">
              📎
              <input
                type="file"
                accept=".txt,.md,.csv,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onUploadIcp(file);
                }}
              />
            </label>
          )}
          <input
            value={input}
            placeholder={inSetup ? 'Type your answer — plain text is fine…' : 'Tell the system what to do — run a cycle, approve drafts, switch profiles…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            aria-label="Message"
          />
          <button className="btn btn-primary" onClick={() => send()} disabled={!input.trim() || typing}>
            <IconSend size={15} /> Send
          </button>
        </div>
        <p className="panel-note">
          {inSetup
            ? 'Setup runs in this chat — you can also configure everything in Settings.'
            : 'Answers come from the backend Responder when Django is running; otherwise simulated locally.'}
        </p>
      </div>
    </div>
  );
}
