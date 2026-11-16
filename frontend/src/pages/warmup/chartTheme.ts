/**
 * Chart theming for the warmup dashboard — colors are NEVER hardcoded here.
 *
 * ApexCharts can't consume `var(--accent)` strings, so every chart resolves
 * the app's CSS custom properties to computed values at runtime via
 * getComputedStyle. If the owner retunes the theme tokens, the charts follow
 * on the next mount/refresh without a code change.
 */
import { useState, useLayoutEffect } from 'react';

export interface ChartTheme {
  /** brand accent (orange) — primary series color */
  accent: string;
  success: string;
  warn: string;
  danger: string;
  /** body text + secondary text for axis labels */
  text: string;
  text2: string;
  /** panel background + borders for tooltips/grid */
  panel: string;
  border: string;
  fontFamily: string;
}

const FALLBACK: ChartTheme = {
  accent: '#f97316',
  success: '#15803d',
  warn: '#a16207',
  danger: '#b91c1c',
  text: '#1f1b16',
  text2: '#5c564d',
  panel: '#ffffff',
  border: '#e3dfd7',
  fontFamily: 'Inter, sans-serif',
};

function prop(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || fallback;
}

/** Read the live theme tokens from :root. Browser-only — never called during prerender. */
export function readChartTheme(): ChartTheme {
  if (typeof document === 'undefined') return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  return {
    accent: prop(s, '--accent', FALLBACK.accent),
    success: prop(s, '--success', FALLBACK.success),
    warn: prop(s, '--warn', FALLBACK.warn),
    danger: prop(s, '--danger', FALLBACK.danger),
    text: prop(s, '--text', FALLBACK.text),
    text2: prop(s, '--text-2', FALLBACK.text2),
    panel: prop(s, '--panel', FALLBACK.panel),
    border: prop(s, '--border', FALLBACK.border),
    fontFamily: prop(s, '--font', FALLBACK.fontFamily),
  };
}

/**
 * Theme as state: empty on the server/prerender pass, resolved right after
 * mount so charts render with the real computed tokens.
 */
export function useChartTheme(): ChartTheme | null {
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  useLayoutEffect(() => {
    setTheme(readChartTheme());
  }, []);
  return theme;
}

/** Warmth score → color. Mirrors the source dashboard: <40 cold, <70 warming, else hot. */
export function warmthColor(score: number, t: ChartTheme): string {
  if (score < 40) return t.danger;
  if (score < 70) return t.warn;
  return t.accent;
}

/** "Nov 12" / "Nov 12, 2025" style axis ticks (year only when it differs from today).
 * Apex can call label formatters with undefined for skipped ticks — guard. */
export function formatDayTick(date: string | number | undefined | null): string {
  if (date === undefined || date === null || date === '') return '';
  const raw = String(date);
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The FastAPI timestamps are naive UTC ("2026-11-12T04:39:51.437837" — no Z).
 * Date.parse would read them as local time; normalize to UTC before use.
 */
export function parseWarmupTs(iso: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasZone ? iso : `${iso}Z`);
}
