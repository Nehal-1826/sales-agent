import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface PlacementDonutProps {
  placement: { inbox_pct: number; promotions_pct: number; spam_pct: number };
  isLoading?: boolean;
}

const COLORS = {
  inbox: '#F26522',
  promotions: '#ffd54f',
  spam: '#ff6b4a',
};

export function PlacementDonut({ placement, isLoading }: PlacementDonutProps) {
  const data = [
    { name: 'Inbox', value: placement.inbox_pct, color: COLORS.inbox },
    { name: 'Promotions', value: placement.promotions_pct, color: COLORS.promotions },
    { name: 'Spam', value: placement.spam_pct, color: COLORS.spam },
  ];
  const allZero = data.every((d) => !d.value);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Inbox placement</CardTitle>
        <p className="text-xs text-text-dim">Where warmup mail is landing right now.</p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : allZero ? (
          <div className="flex h-52 flex-col items-center justify-center text-center">
            <p className="text-sm text-text-dim">
              Placement signals appear once warmup is underway.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #2a2a3a',
                      borderRadius: 8,
                      color: '#e8e8f0',
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                  />
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-3 text-xs">
              {data.map((d) => (
                <li key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                    aria-hidden
                  />
                  <span className="text-text-dim">{d.name}</span>
                  <span className="font-medium text-text">{d.value.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
