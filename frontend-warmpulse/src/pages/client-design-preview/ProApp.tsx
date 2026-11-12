import { ProAppShell } from './pro-app/ProAppShell';
import './pro-app/pro-app.css';

/**
 * ProApp — top-level mount for the integrated Pro client preview.
 * Renders the shell which contains the sidebar + topbar + <Outlet />.
 * Child routes (dashboard / mailboxes / activity / ...) are declared in App.tsx.
 */
export function ProApp() {
  return <ProAppShell />;
}

export default ProApp;
