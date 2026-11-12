import { TierShell, ToolLauncher, TIER_CONFIG } from '@/features/tools/tier';

/**
 * /app/tools — Pro tier. Dark card grid with subtle hover lift. Sub-routes
 * (/app/tools/<tool>) fall through to the shared tool components via the
 * ToolsPage outlet.
 */
export function ProTools() {
  return (
    <TierShell config={TIER_CONFIG.pro}>
      <ToolLauncher config={TIER_CONFIG.pro} />
    </TierShell>
  );
}

export default ProTools;
