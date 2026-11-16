import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import '@/pages/landing/hero-theme.css';
import './auth-card.css';

interface AuthCardProps {
  heading: string;
  subheading?: string;
  children: ReactNode;
  /** OR-divider slot (e.g. the Google button). */
  social?: ReactNode;
  /** Footer row below the form (e.g. "Already have an account?"). */
  footer?: ReactNode;
  className?: string;
  /** signup → big brand panel + peer feed + stats. login → stacked testimonials. */
  variant?: 'signup' | 'login';
}

type Testimonial = { initials: string; quote: ReactNode; who: string; org: string };

const TESTIMONIALS: Testimonial[] = [
  {
    initials: 'PS',
    quote: (
      <>
        Went from <em>60% to 94% inbox</em> in 28 days. Game-changer for our SDR team.
      </>
    ),
    who: 'Priya S.',
    org: 'Northwind',
  },
  {
    initials: 'MW',
    quote: (
      <>
        Connected 3 mailboxes. <em>Zero spam complaints</em> in 6 weeks.
      </>
    ),
    who: 'Marcus W.',
    org: 'Lumen Labs',
  },
  {
    initials: 'SR',
    quote: (
      <>
        The peer network is <em>the differentiator</em>. Templates can't compete.
      </>
    ),
    who: 'Sofia R.',
    org: 'Acme Outreach',
  },
];

/* ----- Shell ----- */

function LoginBrandPanel() {
  return (
    <aside className="auth-card-shell__brand auth-card-shell__brand--login">
      <Link to="/" className="auth-card-shell__brand-mark">
        <span className="auth-card-shell__brand-logo">
          <svg viewBox="0 0 80 80" fill="none">
            <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#auth-logo-grad-login)" />
            <path d="M16 30 L40 48 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <g transform="translate(54 22)"><path d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z" fill="white" /></g>
            <defs>
              <linearGradient id="auth-logo-grad-login" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F26522" />
                <stop offset="1" stopColor="#FF8A4B" />
              </linearGradient>
            </defs>
          </svg>
        </span>
        <span className="auth-card-shell__brand-word">WarmPulse</span>
      </Link>

      <motion.span
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="auth-card-shell__login-eyebrow"
      >
        What customers say
      </motion.span>

      <div className="auth-card-shell__testimonials">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="auth-card-shell__testimonial"
          >
            <div className="auth-card-shell__testimonial-avatar">{t.initials}</div>
            <div className="auth-card-shell__testimonial-body">
              <blockquote>{t.quote}</blockquote>
              <div className="auth-card-shell__testimonial-meta">
                <span className="auth-card-shell__testimonial-who">{t.who}</span>
                <span className="auth-card-shell__testimonial-org">· {t.org}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="auth-card-shell__login-rating"
      >
        <span className="auth-card-shell__login-rating-stars">★ ★ ★ ★ ★</span>
        <span className="auth-card-shell__login-rating-text">
          <strong>4.8</strong> · 210 G2 reviews
        </span>
      </motion.div>
    </aside>
  );
}

export function AuthCard({
  heading,
  subheading,
  children,
  social,
  footer,
  className,
  variant = 'signup',
}: AuthCardProps) {
  return (
    <div className={cn('auth-card-shell', className)}>
      <div className="auth-card-shell__atmosphere" aria-hidden>
        <div className="auth-card-shell__aurora-1" />
        <div className="auth-card-shell__aurora-2" />
        <div className="auth-card-shell__grid" />
      </div>

      {variant === 'login' ? (
        <LoginBrandPanel />
      ) : (
      <aside className="auth-card-shell__brand">
        <div className="auth-card-shell__brand-glass">
        <Link to="/" className="auth-card-shell__brand-mark">
          <span className="auth-card-shell__brand-logo">
            <svg viewBox="0 0 80 80" fill="none">
              <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#auth-logo-grad)" />
              <path d="M16 30 L40 48 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <path d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <g transform="translate(54 22)"><path d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z" fill="white" /></g>
              <defs>
                <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#F26522" />
                  <stop offset="1" stopColor="#FF8A4B" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="auth-card-shell__brand-word">WarmPulse</span>
        </Link>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="auth-card-shell__brand-headline"
        >
          Land in inbox.<br />
          <span className="wp-headline-grad">Not in spam.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="auth-card-shell__brand-body"
        >
          A peer-inbox network of <strong>2,800+ real mailboxes</strong> that opens, replies,
          stars, and rescues your mail from spam — building sender reputation that actually
          moves the needle.
        </motion.p>

        <div className="auth-card-shell__stats">
          {[
            { v: '94.2%', l: 'Inbox placement' },
            { v: '2,841', l: 'Peer mailboxes' },
            { v: '12.4k', l: 'Mailboxes warmed' },
          ].map((s) => (
            <div key={s.l} className="auth-card-shell__stat">
              <div className="auth-card-shell__stat-v">{s.v}</div>
              <div className="auth-card-shell__stat-l">{s.l}</div>
            </div>
          ))}
        </div>
        </div>
      </aside>
      )}

      <main className="auth-card-shell__form-panel">
        <Link to="/" className="auth-card-shell__back">
          <ArrowLeft size={14} strokeWidth={2} />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="auth-card-shell__form-wrap"
        >
          <Link to="/" className="auth-card-shell__mobile-mark">
            <span className="auth-card-shell__brand-logo auth-card-shell__brand-logo--sm">
              <svg viewBox="0 0 80 80" fill="none">
                <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#auth-logo-grad-2)" />
                <path d="M16 30 L40 48 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <path d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30" stroke="white" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <g transform="translate(54 22)"><path d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z" fill="white" /></g>
                <defs>
                  <linearGradient id="auth-logo-grad-2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#F26522" />
                    <stop offset="1" stopColor="#FF8A4B" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span className="auth-card-shell__brand-word">WarmPulse</span>
          </Link>

          <div className="auth-card-shell__card">
            <div className="auth-card-shell__sparkle" aria-hidden>
              <Sparkles size={11} />
              <span>Connect a mailbox in 30 seconds</span>
            </div>
            <h1 className="auth-card-shell__heading">{heading}</h1>
            {subheading ? <p className="auth-card-shell__subheading">{subheading}</p> : null}

            <div className="auth-card-shell__form">{children}</div>

            {social ? (
              <>
                <div className="auth-card-shell__divider">
                  <span>or continue with</span>
                </div>
                {social}
              </>
            ) : null}
          </div>

          {footer ? <p className="auth-card-shell__footer">{footer}</p> : null}

          {/* Terms and Privacy links */}
          <p className="auth-card-shell__footer" style={{ marginTop: footer ? '0.5rem' : '1rem' }}>
            <Link to="/privacy" className="hover:text-text" style={{ color: 'var(--wp-text-dim)' }}>
              Privacy Policy
            </Link>
            {' · '}
            <Link to="/terms" className="hover:text-text" style={{ color: 'var(--wp-text-dim)' }}>
              Terms of Service
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
