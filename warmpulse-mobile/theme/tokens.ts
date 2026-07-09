/**
 * WarmPulse dark-theme tokens — ported from the web's hero-theme.css
 * (:root[data-theme='dark']). RN has no CSS variables, so these live as a
 * plain JS object. Keep in sync with frontend/src/pages/landing/hero-theme.css.
 */
export const wp = {
  bg: '#000000',
  surface: '#0a0a0a',
  surface2: '#121212',
  border: '#1f1f1f',
  borderStrong: '#2a2a2a',
  text: '#f4f4f5',
  textDim: '#a1a1aa',
  textFaint: '#71717a',
  accent: '#F26522',
  accentHover: '#FF7B38',
  accent2: '#FF9670',
  success: '#3ddc97',
  warning: '#ffb454',
  danger: '#ff5c7a',
} as const;

/** Font family names registered via expo-font in App.tsx. */
export const fonts = {
  sans: 'Outfit_400Regular',
  sansSemibold: 'Outfit_600SemiBold',
  sansBold: 'Outfit_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;
