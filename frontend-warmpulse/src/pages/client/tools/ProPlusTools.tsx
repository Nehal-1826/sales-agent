import { TierShell, ToolLauncher, TIER_CONFIG } from '@/features/tools/tier';

/**
 * /app/tools — Pro Plus tier. "Experiment Lab" framing: instrument panels with
 * a live accent and reveal motion. The tools self-gate / wire to live data on
 * their own sub-routes.
 */
export function ProPlusTools() {
  return (
    <TierShell config={TIER_CONFIG.pro_plus}>
      <ToolLauncher config={TIER_CONFIG.pro_plus} />
    </TierShell>
  );
}

export default ProPlusTools;
