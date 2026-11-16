import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // apexcharts (~440kB min) is only needed on the logged-in warmup
        // dashboard; keep it out of the main entry so first paint of the
        // marketing site / login stays light. Skipped for the SSR bundle —
        // scripts/prerender.mjs imports dist-ssr/entry-server.js as one file
        // and the SSR graph never pulls the charts in anyway.
        ...(isSsrBuild
          ? {}
          : {
              manualChunks: {
                apexcharts: ['apexcharts', 'react-apexcharts'],
                // jspdf (~350kB min) only fires on the Reports tab's PDF
                // export — same treatment as the charts (C8)
                jspdf: ['jspdf'],
                // keeps the app chunk under 500kB; react rarely changes, so
                // this chunk stays cached across deploys too
                react: ['react', 'react-dom'],
              },
            }),
      },
    },
  },
  server: {
    port: 5173,
    // The Python venvs churn thousands of files (pycache, Django templates)
    // and live in OneDrive — watching them caused reload storms and crashes.
    // Both backends: backend-agent/ (Django) and backend/ (FastAPI).
    watch: {
      ignored: [
        '**/backend-agent/.venv/**',
        '**/backend/.venv/**',
        '**/backend-agent/staticfiles/**',
        '**/backend/staticfiles/**',
        '**/backend-agent/*.sqlite3*',
        '**/backend/*.sqlite3*',
      ],
    },
    // Proxy API calls to the Django backend during development.
    // API_PROXY_TARGET overrides the default when :8000 is taken by
    // something else on this machine (e.g. another project's container).
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/wp-api': {
        target: process.env.WP_API_PROXY_TARGET || 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wp-api\/api/, '/api').replace(/^\/wp-api/, ''),
      },
    },
  },
}));
