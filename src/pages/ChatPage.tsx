import { useEffect, useRef, useState } from 'react';
import { clearChat, getChatHistory, sendChatMessage } from '../lib/api';
import { CHAT_INITIAL } from '../lib/mockData';
import { IconBot, IconSend, IconUser } from '../components/icons';
import { Spinner } from '../components/ui';
import type { ChatMessage } from '../lib/types';

const WELCOME: ChatMessage = {
  id: 0,
  from: 'ai',
  text: 'Vanakkam! 👋 Fresh chat — ask me anything about your leads, drafts or the pipeline.',
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function now(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * CHAT — communication with the Responder (Chatbot).
 * Live answers from the backend when Django is running, local mock otherwise.
 */
export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_INITIAL);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory().then((history) => {
      if (history && history.length > 0) {
        setMessages(
          history.map((m) => ({
            id: m.id,
            from: m.from,
            text: m.text,
            time: m.time || now(),
          })),
        );
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    setInput('');
    setMessages((m) => [...m, { id: Date.now(), from: 'user', text, time: now() }]);
    setTyping(true);

    const { reply } = await sendChatMessage(text);
    setTyping(false);
    setMessages((m) => [...m, reply]);
  };

  const clear = async () => {
    await clearChat();
    setMessages([{ ...WELCOME, time: now() }]);
  };

  return (
    <div className="page chat-page">
      <div className="chat-shell panel">
        <header className="chat-head">
          <span className="agent-icon">
            <IconBot size={18} />
          </span>
          <div>
            <strong>Responder (Chatbot)</strong>
            <small>Handles responses in the autonomous pipeline</small>
          </div>
          <span className="chip">Responder agent</span>
          <button className="btn btn-ghost chat-clear" onClick={clear} title="Clear the conversation">
            🗑 Clear
          </button>
        </header>

        {loading ? (
          <Spinner label="Loading chat history…" />
        ) : (
        <div className="chat-scroll" ref={scroller}>
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.from}`}>
              <span className="chat-avatar" aria-hidden>
                {m.from === 'ai' ? <IconBot size={14} /> : <IconUser size={14} />}
              </span>
              <div className="chat-bubble">
                <span className="who">{m.from === 'ai' ? 'Responder' : 'You'}</span>
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

        <div className="chat-input-row">
          <input
            value={input}
            placeholder="Ask about leads, outreach copy, or the last pipeline run…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            aria-label="Message"
          />
          <button className="btn btn-primary" onClick={send} disabled={!input.trim() || typing}>
            <IconSend size={15} /> Send
          </button>
        </div>
        <p className="panel-note">Answers come from the backend Responder when Django is running; otherwise simulated locally.</p>
      </div>
    </div>
  );
}
