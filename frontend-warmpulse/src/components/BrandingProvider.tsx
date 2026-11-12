import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useBranding, BRANDING_DEFAULTS, getLogoUrl } from '@/features/branding/api';

/**
 * BrandingProvider — fetches the resolved branding for the current user
 * (or their parent agency) and pushes it into the DOM as CSS custom
 * properties plus document.title. Children read the live branding via
 * `useBrand()`.
 *
 * Side-effects:
 *   --wp-accent / --wp-accent-2 / --wp-accent-hover on documentElement
 *   document.title prefixed with the brand name
 *
 * Defaults to WarmPulse values if the query is unresolved.
 */

export interface BrandContext {
  name: string;
  logoUrl: string | null;
  accentColor: string;
  footer: string;
  isInherited: boolean;
  isLoading: boolean;
}

const FALLBACK_CONTEXT: BrandContext = {
  name: 'WarmPulse',
  logoUrl: null,
  accentColor: BRANDING_DEFAULTS.accent_color,
  footer: BRANDING_DEFAULTS.footer_text,
  isInherited: false,
  isLoading: false,
};

const BrandCtx = createContext<BrandContext>(FALLBACK_CONTEXT);

export function useBrand(): BrandContext {
  return useContext(BrandCtx);
}

// ---------- color helpers ----------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
  if (!m || !m[1]) return null;
  let h: string = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

export function shiftLightness(hex: string, delta: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToHex(h, s, clamp(l + delta, 0, 1));
}

/** Approximate luminance (0..1) from a hex. Lightness in HSL is good enough. */
export function approxLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [, , l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return l;
}

// ---------- provider ----------

interface ProviderProps {
  children: ReactNode;
}

export function BrandingProvider({ children }: ProviderProps): JSX.Element {
  const query = useBranding();
  const originalTitleRef = useRef<string | null>(null);

  const data = query.data ?? null;

  const value: BrandContext = useMemo(() => {
    if (!data) {
      return { ...FALLBACK_CONTEXT, isLoading: query.isLoading };
    }
    return {
      name: data.brand_name || FALLBACK_CONTEXT.name,
      logoUrl: data.has_logo ? getLogoUrl() : null,
      accentColor: data.accent_color || FALLBACK_CONTEXT.accentColor,
      footer: data.footer_text || FALLBACK_CONTEXT.footer,
      isInherited: data.is_inherited,
      isLoading: query.isLoading,
    };
  }, [data, query.isLoading]);

  // Capture the initial document.title once so we can prefix consistently.
  useEffect(() => {
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
  }, []);

  // Apply CSS variables.
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    // Defense-in-depth: legacy WarmPulse default was a violet (#7c5cff and
    // neighbours). The backend auto-migrates these on read, but coerce any
    // straggler to the Shailog orange so the UI stays on-brand regardless
    // of stored DB values. Real custom brand colors outside the legacy set
    // pass through unchanged.
    const LEGACY_VIOLETS = new Set([
      '#7c5cff', '#6d4dff', '#8d72ff', '#a78bfa', '#5a3aee',
    ]);
    const raw = (data.accent_color || '').toLowerCase();
    const accent = LEGACY_VIOLETS.has(raw) ? '#F26522' : data.accent_color;
    if (accent && hexToRgb(accent)) {
      root.style.setProperty('--wp-accent', accent);
      const lighter = shiftLightness(accent, 0.12);
      const darker = shiftLightness(accent, -0.08);
      if (lighter) root.style.setProperty('--wp-accent-2', lighter);
      if (darker) root.style.setProperty('--wp-accent-hover', darker);
    }
  }, [data]);

  // Apply document.title prefix.
  useEffect(() => {
    if (!data) return;
    const base = originalTitleRef.current ?? document.title;
    const brand = data.brand_name?.trim();
    if (brand && brand.length > 0) {
      document.title = `${brand} · ${base}`;
    }
  }, [data]);

  return <BrandCtx.Provider value={value}>{children}</BrandCtx.Provider>;
}
