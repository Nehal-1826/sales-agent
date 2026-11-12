import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The Python venv churns thousands of files (pycache, Django templates)
    // and lives in OneDrive — watching it caused reload storms and crashes.
    watch: {
      ignored: ['**/backend/.venv/**', '**/backend/staticfiles/**', '**/backend/*.sqlite3*'],
    },
    // Proxy API calls to the Django backend during development.
    // API_PROXY_TARGET overrides the default when :8000 is taken by
    // something else on this machine (e.g. another project's container).
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
