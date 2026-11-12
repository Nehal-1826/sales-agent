import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import path from 'node:path';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    // Precompress assets at build time so nginx serves .gz / .br directly
    // (gzip_static / brotli_static) instead of compressing on every request.
    // Static gzip -9 / brotli beats nginx's on-the-fly level and offloads CPU.
    compression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
    compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Pre-bundle deps that are only reached through lazy routes (charts, radix
    // primitives, export libs). Without this, Vite discovers them on first
    // navigation, re-optimizes mid-session and bumps the ?v= hash — which makes
    // already-loaded modules 504 "Outdated Optimize Dep" and the route's dynamic
    // import fail ("Failed to fetch dynamically imported module"). Listing them
    // here bundles everything at startup so the dev server stays stable.
    include: [
      'recharts',
      'apexcharts',
      'react-apexcharts',
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      'gsap',
      'date-fns',
      'qrcode.react',
      'react-hook-form',
      '@hookform/resolvers/zod',
      'zod',
      'sonner',
      '@radix-ui/react-accordion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },
  server: {
    port: 5173,
    // Allow Firebase signInWithPopup to communicate back to the opener.
    // Default COOP=same-origin blocks window.opener.postMessage from the
    // Google sign-in popup, which is why Firebase auth was silently failing.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        // Preserve auth + avoid hopping from 127.0.0.1 → localhost on 307s.
        followRedirects: false,
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    // Mirror the dev proxy so the production-build preview can reach the API.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    // Prod sourcemaps were being shipped publicly (~23 MB) and exposed source.
    // Disable: smaller image, faster builds, no source disclosure. If Sentry
    // symbolication is wanted later, switch to 'hidden' + a sourcemap upload.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split big, rarely-changing vendors into their own long-cached chunks
        // so a code deploy doesn't bust the React/charts/firebase caches, and
        // the initial entry chunk stays lean.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Ubiquitous micro-helpers (clsx/tailwind-merge/tslib/cva) are shared by
          // BOTH the app shell and feature libs. Pin them to the eager base chunk
          // so Rollup doesn't bucket them into vendor-charts/-export and thereby
          // drag those heavy chunks onto first paint for one helper function.
          if (/[\\/]node_modules[\\/](clsx|tailwind-merge|tslib|class-variance-authority|@swc[\\/]helpers|@babel[\\/]runtime|fflate)[\\/]/.test(id))
            return 'vendor-react';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'vendor-react';
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'vendor-firebase';
          if (/[\\/]node_modules[\\/](apexcharts|react-apexcharts|recharts|d3-|victory-)/.test(id))
            return 'vendor-charts';
          if (/[\\/]node_modules[\\/](framer-motion|gsap|lenis)[\\/]/.test(id)) return 'vendor-motion';
          // NB: jspdf/xlsx/html2canvas are deliberately NOT forced into a manual
          // chunk. They share a low-level module with the app shell; bucketing
          // them creates a static entry→bundle edge that drags all ~230 KB onto
          // first paint. Left to Vite's default splitting they become async
          // chunks loaded only by the lazy agency/report pages that use them.
          // Everything else: let Vite's default per-route splitting decide, so
          // the long tail (radix, etc.) only loads on routes that use it rather
          // than forcing one mega catch-all vendor chunk onto first paint.
          return undefined;
        },
      },
    },
  },
});
