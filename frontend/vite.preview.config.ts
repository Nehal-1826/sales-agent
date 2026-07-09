import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Isolated design-preview server (port 35001).
 *
 * Renders ONLY the redesigned components (ProDashboardV2, MailboxDrillInV2)
 * from `design-preview/` with their built-in mock data, so the redesign can
 * be reviewed without touching the live app on :5173. Run with:
 *
 *   pnpm preview:design     (see package.json script)
 *   # or: npx vite --config vite.preview.config.ts
 *
 * Tailwind/PostCSS still resolve because vite runs from the frontend/ cwd,
 * so tailwind.config.ts `content` globs (./src/**) and postcss.config apply.
 */
export default defineConfig({
  root: path.resolve(__dirname, './design-preview'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 35001,
    strictPort: true,
    fs: {
      // Allow importing from ../src and ../node_modules outside the root.
      allow: [path.resolve(__dirname, '.')],
    },
  },
});
