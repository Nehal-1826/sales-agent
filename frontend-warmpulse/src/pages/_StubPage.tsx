import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Construction } from 'lucide-react';

interface StubPageProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Lightweight placeholder used by every post-Wave-1 stub page. */
export function StubPage({ title, description, children }: StubPageProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-text-dim">{description}</p> : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          {children ?? (
            <EmptyState
              icon={<Construction className="h-5 w-5" />}
              title={`${title} is scaffolded`}
              description="This section will be fleshed out by a later wave. The sidebar entry, route, and layout are already in place."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
