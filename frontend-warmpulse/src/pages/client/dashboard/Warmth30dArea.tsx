import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';

interface Warmth30dAreaProps {
  points: Array<{ date: string; warmth_score: number }>;
  isLoading?: boolean;
}

function formatTick(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return formatDate(d);
}

export function Warmth30dArea({ points, isLoading }: Warmth30dAreaProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Warmth trend (30 days)</CardTitle>
        <p className="text-xs text-text-dim">
          Daily mean warmth across all active mailboxes.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="h-64 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="warmthArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F26522" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8888a0', fontSize: 11 }}
                  tickFormatter={formatTick}
                  axisLine={{ stroke: '#2a2a3a' }}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fill: '#8888a0', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  width={36}
                />
                <Tooltip
                  cursor={{ stroke: '#F26522', strokeOpacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    color: '#e8e8f0',
                    fontSize: 12,
                  }}
                  labelFormatter={(l: string) => formatTick(l)}
                  formatter={(v: number) => [`${v}`, 'Warmth']}
                />
                <Area
                  type="monotone"
                  dataKey="warmth_score"
                  stroke="#F26522"
                  strokeWidth={2}
                  fill="url(#warmthArea)"
                >
                  {/* Sparse numeric labels — ~6-8 markers across the range so
                      the eye reads concrete values without clutter. First +
                      last + every 4th in between. */}
                  <LabelList
                    dataKey="warmth_score"
                    position="top"
                    formatter={
                      ((value: unknown, _entry: unknown, ix?: number) => {
                        if (typeof value !== 'number' || !Number.isFinite(value))
                          return '';
                        const idx =
                          typeof ix === 'number'
                            ? ix
                            : (
                                _entry as
                                  | { index?: number; payload?: { index?: number } }
                                  | undefined
                              )?.index ?? 0;
                        const last = points.length - 1;
                        if (idx === 0 || idx === last || idx % 4 === 0) {
                          return String(Math.round(value));
                        }
                        return '';
                      }) as unknown as (value: unknown) => string
                    }
                    style={{
                      fill: '#e8e8f0',
                      fontSize: 11,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      paintOrder: 'stroke',
                      stroke: '#12121a',
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                    }}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
