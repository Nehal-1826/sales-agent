import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
