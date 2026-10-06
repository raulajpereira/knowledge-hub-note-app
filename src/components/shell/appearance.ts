import { BG_DEFAULTS, DEFAULT_ACCENT, type Prefs } from '@/lib/prefs';
import type { AmbientName } from '@/components/ui';
import { fontCss, type FontName } from './fonts';

// Effective look from (already plan-filtered) prefs — prototype `_theme`.
export type Appearance = {
  bg: { mode: AmbientName | 'photo'; blur: number; dim: number };
  font: FontName;
  fontScale: number;
  uiScale: number;
  glassBlur: number | null;
  accent: string;
};

export function appearanceOf(p: Prefs): Appearance {
  return {
    bg: { ...BG_DEFAULTS, ...(p.bg ?? {}) },
    font: p.font ?? 'Geist',
    fontScale: p.fontScale ?? 1,
    uiScale: p.uiScale ?? 1,
    glassBlur: p.glassBlur ?? null,
    accent: p.accent ?? DEFAULT_ACCENT,
  };
}

/**
 * CSS for the signed-in app. Every value comes from a Zod-validated pref
 * (enums, bounded numbers, #rrggbb), so nothing user-typed reaches the CSS.
 */
export function appearanceCss(a: Appearance): string {
  const root = [`--accent:${a.accent}`, `--ui-scale:${a.uiScale}`];
  if (a.glassBlur !== null) root.push(`--glass-blur-user:${a.glassBlur}px`);
  const body = [`font-family:${fontCss(a.font)}`];
  if (a.uiScale !== 1) body.push(`zoom:${a.uiScale}`);
  // Prototype: font-size-adjust 0.52 × scale scales every text size at once.
  if (a.fontScale !== 1) body.push(`font-size-adjust:${Math.round(0.52 * a.fontScale * 1000) / 1000}`);
  return `:root{${root.join(';')}}body{${body.join(';')}}`;
}
