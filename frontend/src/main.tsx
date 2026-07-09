import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { queryClient } from '@/lib/query';
import { initSentry, SentryErrorBoundary } from '@/lib/sentry';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { LenisProvider } from '@/providers/LenisProvider';
import { ScrollProgress } from '@/providers/ScrollProgress';
import { AppToaster } from '@/components/ui/AppToast';
import { ConfirmDialogRoot } from '@/components/ui/ConfirmDialog';
import { LiveBackground } from '@/components/brand/LiveBackground';
import { RouteLoader } from '@/components/brand/RouteLoader';
import { BrandingProvider } from '@/components/BrandingProvider';
import { LocaleDirSync } from '@/components/LocaleDirSync';

import './index.css';

// Wire Sentry before the React tree mounts so its first error reaches us.
// No-op when VITE_SENTRY_DSN is unset.
initSentry();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <SentryErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <LenisProvider>
              <LocaleDirSync />
              <LiveBackground />
              <ScrollProgress />
              <RouteLoader />
              {/* Interactive content sits above the canvas. SplashScreen
                  uses its own z-[100] so it covers everything. */}
              <BrandingProvider>
                <div className="relative z-10">
                  <App />
                </div>
              </BrandingProvider>
              <AppToaster />
              <ConfirmDialogRoot />
            </LenisProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </SentryErrorBoundary>
  </StrictMode>,
);
