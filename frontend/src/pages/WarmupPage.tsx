import { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui';
import { warmupHealth } from '../lib/warmupApi';

/** Warmup section stub — the real mailbox-warmup dashboards port in the next
 *  phase. For now this only shows whether the FastAPI backend answers. */
export function WarmupPage() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => { warmupHealth().then(setUp); }, []);
  return (
    <div className="page">
      <PageHeader
        title="Warmup"
        subtitle="Mailbox warmup network — dashboards arrive in the next phase."
      />
      <section className={`panel warmup-status${up === null ? ' probing' : up ? ' up' : ' down'}`}>
        {up === null
          ? 'Checking warmup backend…'
          : up
            ? 'Warmup backend: live · FastAPI'
            : 'Warmup backend: not reachable (start backend-warmup on :8001)'}
      </section>
    </div>
  );
}
