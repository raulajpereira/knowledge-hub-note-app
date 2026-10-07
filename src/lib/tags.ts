// Prototype tagTint: a stable tint per tag name.
const TAG_TINTS = [
  'oklch(0.7 0.12 240 / .35)',
  'oklch(0.7 0.14 330 / .35)',
  'oklch(0.7 0.14 25 / .35)',
  'oklch(0.7 0.12 290 / .35)',
  'oklch(0.72 0.12 160 / .35)',
  'oklch(0.8 0.1 80 / .35)',
];
export function tagTint(s: string): string {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_TINTS[x % TAG_TINTS.length]!;
}
