import { motion } from 'framer-motion';
import { Network } from 'lucide-react';
import { useDedicatedPoolStatus } from '@/features/dedicated-pool/api';
import { usePlan } from '@/lib/usePlan';

/**
 * Workspace status card showing the dedicated peer pool assignment.
 *
 * Read-only — admin assigns pools on the backend. Hidden entirely for tiers
 * below Agency (the tab system gates anyway; we just don't render).
 *
 *   - Agency + assigned   → green "Active" pill + member count + provider mix.
 *   - Agency + unassigned → grey "Not configured" pill + contact-support copy.
 *   - Lower tier          → renders nothing.
 */

interface ProviderMix {
  gmail: number;
  outlook: number;
  yahoo: number;
  smtp: number;
}

const PROVIDER_LABELS: Array<{ key: keyof ProviderMix; label: string }> = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'yahoo', label: 'Yahoo' },
  { key: 'smtp', label: 'SMTP' },
];

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--wp-surface)',
  border: '1px solid var(--wp-border)',
  borderRadius: 16,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  color: 'var(--wp-text)',
};

const PILL_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '3px 8px',
  borderRadius: 999,
  width: 'fit-content',
};

export function DedicatedPoolCard() {
  const { isAgency } = usePlan();
  const query = useDedicatedPoolStatus();

  // Hidden for non-Agency/Enterprise tiers — the tab system already gates.
  if (!isAgency) return null;

  if (query.isLoading) {
    return (
      <section style={CARD_STYLE} aria-busy="true">
        <div
          style={{
            height: 12,
            width: 120,
            background: 'var(--wp-border)',
            borderRadius: 4,
            opacity: 0.6,
          }}
        />
        <div
          style={{
            height: 28,
            width: '70%',
            background: 'var(--wp-border)',
            borderRadius: 6,
            opacity: 0.4,
          }}
        />
        <div
          style={{
            height: 10,
            width: '90%',
            background: 'var(--wp-border)',
            borderRadius: 4,
            opacity: 0.3,
          }}
        />
      </section>
    );
  }

  const data = query.data ?? null;
  const isDedicated = data?.is_dedicated === true;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={CARD_STYLE}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--wp-text-dim)',
          }}
        >
          <Network size={11} strokeWidth={2.4} />
          Dedicated helper group
        </span>
        {isDedicated ? (
          <span
            style={{
              ...PILL_BASE,
              background: 'color-mix(in srgb, var(--wp-success) 18%, transparent)',
              color: 'var(--wp-success)',
              border:
                '1px solid color-mix(in srgb, var(--wp-success) 40%, transparent)',
            }}
          >
            Active
          </span>
        ) : (
          <span
            style={{
              ...PILL_BASE,
              background: 'color-mix(in srgb, var(--wp-text-faint) 14%, transparent)',
              color: 'var(--wp-text-dim)',
              border: '1px solid var(--wp-border)',
            }}
          >
            Not configured
          </span>
        )}
      </header>

      {isDedicated && data ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--wp-text)' }}>
              {data.member_count} {data.member_count === 1 ? 'helper inbox' : 'helper inboxes'} in
              dedicated group
            </span>
            {data.pool_name ? (
              <span style={{ fontSize: 12, color: 'var(--wp-text-dim)' }}>
                Group · {data.pool_name}
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {PROVIDER_LABELS.filter((p) => data.provider_mix[p.key] > 0).map((p) => (
              <span
                key={p.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--wp-accent) 30%, var(--wp-border))',
                  color: 'var(--wp-text)',
                }}
              >
                {p.label} · {data.provider_mix[p.key]}
              </span>
            ))}
          </div>

          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--wp-text-faint)',
            }}
          >
            Your warmup traffic uses only helper inboxes in this private group — never the
            shared default group.
          </p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--wp-text)' }}>
              No dedicated helper group assigned
            </span>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--wp-text-dim)',
              }}
            >
              Dedicated helper groups are an Enterprise feature. Contact support to
              request one — your warmup currently uses the shared default group.
            </p>
          </div>
          <a
            href="mailto:support@warmpulse.io"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--wp-accent)',
              textDecoration: 'none',
              width: 'fit-content',
            }}
          >
            Contact support →
          </a>
        </>
      )}
    </motion.section>
  );
}

export default DedicatedPoolCard;
