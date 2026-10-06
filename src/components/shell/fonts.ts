// Typeface list of Definições › Tipo de Letra (prototype FONTS), served
// from our own origin through @fontsource (no Google Fonts requests).
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/outfit';
import '@fontsource-variable/nunito-sans';
import type { FONTS } from '@/lib/prefs';

export type FontName = (typeof FONTS)[number];

const FAMILY: Record<FontName, string> = {
  Geist: 'var(--font-geist-sans)',
  'Plus Jakarta Sans': "'Plus Jakarta Sans Variable'",
  'DM Sans': "'DM Sans Variable'",
  Manrope: "'Manrope Variable'",
  'IBM Plex Sans': "'IBM Plex Sans'",
  'Space Grotesk': "'Space Grotesk Variable'",
  Outfit: "'Outfit Variable'",
  'Nunito Sans': "'Nunito Sans Variable'",
};

/** prototype fontCss(f) */
export const fontCss = (f: FontName) => `${FAMILY[f]}, system-ui, sans-serif`;
