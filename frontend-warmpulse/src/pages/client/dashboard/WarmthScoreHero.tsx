import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { warmthColorToken } from '@/features/mailboxes/types';

interface WarmthScoreHeroProps {
  score: number;
  delta?: number;
  isLoading?: boolean;
  mailboxCount?: number;
}

const TOKEN_TO_HEX: Record<'accent' | 'accent4' | 'accent3', string> = {
  accent: '#F26522',
  accent4: '#ffd54f',
  accent3: '#ff6b4a',
};

/**
 * Big circular gauge 0–100, color-coded:
 *   <40  → accent3 (red/orange)
 *   40–70 → accent4 (yellow)
 *   >70  → accent  (green)
 *
 * Rendered as an SVG arc to avoid a Recharts dep for a single shape.
 */
export function WarmthScoreHero({
  score,
  delta = 0,
  isLoading,
  mailboxCount,
}: WarmthScoreHeroProps) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const token = warmthColorToken(pct);
  const color = TOKEN_TO_HEX[token];

  // SVG arc params.
  const size = 220;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center gap-4 p-8 sm:flex-row sm:gap-10">
        <div className="relative" aria-label={`Warmth score ${pct} of 100`} role="img">
          {isLoading ? (
            <Skeleton className="h-[220px] w-[220px] rounded-full" />
          ) : (
            <motion.svg
              width={size}
              height={size}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              viewBox={`0 0 ${size} ${size}`}
            >
              <defs>
                <linearGradient id="warmth-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={color} stopOpacity="1" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.6" />
                </linearGradient>
              </defs>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#1a1a26"
                strokeWidth={stroke}
                fill="none"
              />
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="url(#warmth-grad)"
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circ}
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: circ - dash }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: `drop-shadow(0 0 12px ${color}55)` }}
              />
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                fill="#e8e8f0"
                fontSize="56"
                fontWeight="700"
                fontFamily="Outfit, system-ui, sans-serif"
              >
                {pct}
              </text>
              <text
                x="50%"
                y="62%"
                textAnchor="middle"
                fill="#8888a0"
                fontSize="12"
                letterSpacing="0.15em"
                fontFamily="Outfit, system-ui, sans-serif"
              >
                WARMTH
              </text>
            </motion.svg>
          )}
        </div>

        <div className="max-w-md text-center sm:text-left">
          <p className="text-xs uppercase tracking-widest text-text-dim">Workspace warmth</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            {pct < 40 ? 'Cold' : pct < 70 ? 'Warming' : 'Hot'}
          </h2>
          <p className="mt-2 text-sm text-text-dim">
            Mean warmth across {mailboxCount ?? 0} mailbox{(mailboxCount ?? 0) === 1 ? '' : 'es'}. Higher is better —
            we target 70+ sustained for optimal deliverability.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-text-dim sm:justify-start">
            <span
              className={`font-medium ${
                delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim'
              }`}
            >
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {Math.abs(delta).toFixed(1)} pts
            </span>
            <span>vs yesterday</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
