import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Each token resolves to a CSS variable defined in index.css (dark values
// under :root, light overrides under :root[data-theme='light']) — this is what
// lets the WHOLE app, not just the shells, render a coherent light theme.
//
// CRITICAL: wrap in color-mix with the `<alpha-value>` placeholder so Tailwind
// can still apply opacity modifiers (bg-surface/60, bg-accent2/10, …). A bare
// `var(--x)` color makes those modifiers compile to NOTHING — Tailwind can't
// derive an alpha channel from a var — which left every `bg-surface/60` card
// with no background (invisible). With <alpha-value>: solid utilities get 100%
// (identical to the raw color → dark theme unchanged) and /NN utilities get NN%.
const tok = (cssVar: string, fallback: string) =>
  `color-mix(in srgb, var(${cssVar}, ${fallback}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: tok('--bg', '#0a0a0f'),
        surface: tok('--surface', '#12121a'),
        'surface-2': tok('--surface-2', '#1a1a26'),
        'border-muted': tok('--border-muted', '#2a2a3a'),
        accent: {
          // Resolves to --wp-accent so admin + client stay in sync; falls back
          // to the Shailog brand coral-orange if the var is missing.
          DEFAULT: tok('--wp-accent', '#F26522'),
          2: tok('--accent-2', '#FF8A4B'),
          3: tok('--accent-3', '#FF9670'),
          4: tok('--accent-4', '#ffd54f'),
        },
        accent2: tok('--accent-2', '#FF8A4B'),
        accent3: tok('--accent-3', '#FF9670'),
        accent4: tok('--accent-4', '#ffd54f'),
        text: {
          DEFAULT: tok('--text', '#e8e8f0'),
          dim: tok('--text-dim', '#8888a0'),
          // Dimmest text tier — used for stepper labels, breadcrumbs, eyebrow
          // text. Without this key, `text-text-faint` generates no CSS.
          faint: tok('--text-faint', '#5a5a72'),
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(242, 101, 34, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(242, 101, 34, 0)' },
        },
        // Liquid-glass shimmer that sweeps across a card on hover.
        glassShimmer: {
          '0%': { transform: 'translateX(-120%) skewX(-12deg)' },
          '100%': { transform: 'translateX(220%) skewX(-12deg)' },
        },
        // Logo wave: dash offset animates the sine line through the envelope.
        logoWave: {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '-48' },
        },
        // Logo breathing pulse on the dot marker.
        logoBreathe: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(0.92)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
        },
        splashOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0', visibility: 'hidden' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out forwards',
        slideIn: 'slideIn 0.3s ease-out forwards',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        glassShimmer: 'glassShimmer 1.6s ease-out',
        logoWave: 'logoWave 2.4s linear infinite',
        logoBreathe: 'logoBreathe 2s ease-in-out infinite',
        splashOut: 'splashOut 0.6s ease-out 0.4s forwards',
      },
      boxShadow: {
        glow: '0 0 24px rgba(242, 101, 34, 0.25)',
        'glow-blue': '0 0 24px rgba(255, 138, 75, 0.25)',
        // Liquid glass — soft outer ambient + crisp inset highlight.
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        'glass-hover': '0 12px 48px 0 rgba(242, 101, 34, 0.18), inset 0 1px 0 0 rgba(255, 255, 255, 0.10)',
      },
      borderColor: {
        DEFAULT: tok('--border-muted', '#2a2a3a'),
      },
    },
  },
  plugins: [animate],
};

export default config;
