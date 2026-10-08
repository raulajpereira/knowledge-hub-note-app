/**
 * Avatar backgrounds are generated as oklch(L C H). With the light initials
 * on top, L above 0.5 falls under the WCAG AA contrast (4.5:1); the hue stays.
 */
export function avatarBg(color: string | undefined | null): string | undefined {
  if (!color) return undefined;
  const m = /^oklch\(\s*([\d.]+)(%?)(\s.*)$/i.exec(color.trim());
  if (!m) return color;
  const l = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  return l > 0.5 ? `oklch(0.5${m[3]}` : color;
}
