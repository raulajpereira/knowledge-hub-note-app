export const ACCENTS = [
  { name: 'Purple', hue: 290 },
  { name: 'Blue', hue: 250 },
  { name: 'Teal', hue: 190 },
  { name: 'Green', hue: 145 },
  { name: 'Amber', hue: 70 },
  { name: 'Rose', hue: 20 },
];

export const ACCENT_TO_HUE = Object.fromEntries(
  ACCENTS.map((a) => [a.name.toLowerCase(), a.hue])
);

export function hueForAccent(accentColor) {
  return ACCENT_TO_HUE[accentColor] ?? 290;
}

export const FONT_OPTIONS = [
  {
    id: 'inter',
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Space Grotesk', 'Inter', -apple-system, sans-serif",
  },
  {
    id: 'grotesk',
    body: "'Space Grotesk', 'Inter', -apple-system, sans-serif",
    display: "'Space Grotesk', 'Inter', -apple-system, sans-serif",
  },
  {
    id: 'system',
    body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  {
    id: 'serif',
    body: "Georgia, 'Times New Roman', serif",
    display: "Georgia, 'Times New Roman', serif",
  },
  {
    id: 'mono',
    body: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    display: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

export function fontStackFor(id) {
  return FONT_OPTIONS.find((f) => f.id === id) || FONT_OPTIONS[0];
}

export function getTheme(mode, accentColor, accentHue) {
  const dark = mode === 'dark';
  const hue = Number.isFinite(accentHue) ? accentHue : hueForAccent(accentColor);
  return {
    dark,
    hue,
    pageBg: dark
      ? 'linear-gradient(160deg, oklch(0.20 0.03 255) 0%, oklch(0.155 0.025 255) 45%, oklch(0.115 0.02 258) 100%)'
      : `linear-gradient(160deg, oklch(0.92 0.035 ${hue}) 0%, oklch(0.87 0.03 ${hue + 20}) 45%, oklch(0.83 0.025 ${hue + 40}) 100%)`,
    cardBg: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)',
    modalBg: dark ? 'rgba(17,21,29,0.82)' : 'rgba(255,255,255,0.62)',
    sidebarBg: dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.4)',
    subtleBg: dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.55)',
    hoverBg: dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.75)',
    border: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)',
    textPrimary: dark ? 'oklch(0.96 0.01 255)' : 'oklch(0.22 0.01 280)',
    textMuted: dark ? 'oklch(0.73 0.02 255)' : 'oklch(0.55 0.01 280)',
    accent: `oklch(0.55 0.19 ${hue})`,
    accentDark: `oklch(0.47 0.2 ${hue})`,
    accentText: dark ? `oklch(0.8 0.15 ${hue})` : `oklch(0.5 0.2 ${hue})`,
    accentSoftBg: dark ? `oklch(0.55 0.19 ${hue} / 0.22)` : `oklch(0.55 0.19 ${hue} / 0.16)`,
  };
}
