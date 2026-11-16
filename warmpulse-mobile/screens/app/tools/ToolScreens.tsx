/**
 * Tool detail screens router — renders the active tool screen based on navigation.
 */
import { useToolNav } from '../tools-nav';
import { PlacementTester } from './PlacementTester';
import { SpamScanner } from './SpamScanner';
import { DnsValidator } from './DnsValidator';
import { TemplateDesigner } from './TemplateDesigner';
import { WarmupPreview } from './WarmupPreview';

export function ToolScreens() {
  const { active } = useToolNav();

  switch (active) {
    case 'placement':
      return <PlacementTester />;
    case 'spam':
      return <SpamScanner />;
    case 'dns':
      return <DnsValidator />;
    case 'template':
      return <TemplateDesigner />;
    case 'preview':
      return <WarmupPreview />;
    default:
      return null;
  }
}
