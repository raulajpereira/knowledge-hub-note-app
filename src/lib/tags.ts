import type { CSSProperties } from 'react';

// Tag colours: one stable, vivid colour per tag name, the same everywhere a
// tag is shown (lists, editors, the Tags page, suggestions) — automatic from
// the name, or chosen by the user on the Tags page (prefs.tagColors). Chips carry the
// class `kh-tagc` (globals.css) and these custom properties inline.
//
// Each row: hue, lightness and chroma of the chip fill on the dark glass
// (drawn at 45% alpha), then the chroma of the light text, of the 1px ring,
// of the light fill on a selected (white) card and of its dark text. Chroma
// is the most each hue holds in sRGB, so yellows/teals are a little softer
// than reds/blues. Contrast (text vs. chip, WCAG): ≥ 6.6:1 over dark glass
// (#1c1512), ≥ 4.7:1 over a light wallpaper showing through (#4a3d35),
// ≥ 5.3:1 on the white selected card — checked in tests/unit/tags.test.ts.
export const TAG_PALETTE = [
  [25, 0.6, 0.2, 0.024, 0.174, 0.056, 0.18], // red
  [50, 0.68, 0.178, 0.026, 0.126, 0.064, 0.118], // orange
  [85, 0.7, 0.142, 0.05, 0.168, 0.11, 0.092], // amber
  [130, 0.66, 0.176, 0.05, 0.18, 0.11, 0.12], // lime
  [155, 0.66, 0.162, 0.05, 0.18, 0.11, 0.11], // green
  [185, 0.66, 0.116, 0.05, 0.136, 0.11, 0.078], // teal
  [225, 0.64, 0.12, 0.032, 0.144, 0.072, 0.084], // sky
  [260, 0.58, 0.2, 0.022, 0.156, 0.052, 0.18], // blue
  [290, 0.58, 0.2, 0.024, 0.168, 0.056, 0.18], // violet
  [325, 0.6, 0.2, 0.042, 0.18, 0.098, 0.18], // magenta
] as const;

/**
 * Colours chosen on the Tags page (prefs.tagColors): lower-cased tag name →
 * index into TAG_PALETTE. Tags without an entry keep their automatic colour.
 */
export type TagColorMap = Readonly<Record<string, number>>;

/** The key of a tag in a TagColorMap (tags are case-insensitive). */
export const tagKey = (s: string) => s.trim().toLowerCase();

/** The colour chosen for a tag, if any (a valid palette index). */
export function chosenTagIndex(s: string, chosen?: TagColorMap | null): number | undefined {
  const i = chosen?.[tagKey(s)];
  return Number.isInteger(i) && i! >= 0 && i! < TAG_PALETTE.length ? i : undefined;
}

/** The automatic colour of a tag name: a stable index into TAG_PALETTE (case-insensitive). */
export function autoTagIndex(s: string): number {
  const k = tagKey(s);
  let x = 0;
  for (let i = 0; i < k.length; i++) x = (x * 31 + k.charCodeAt(i)) >>> 0;
  return x % TAG_PALETTE.length;
}

/** Index into TAG_PALETTE for a tag: the chosen colour, else the automatic one. */
export function tagIndex(s: string, chosen?: TagColorMap | null): number {
  return chosenTagIndex(s, chosen) ?? autoTagIndex(s);
}

export type TagColors = { bg: string; fg: string; ring: string; bgOn: string; fgOn: string; ringOn: string };

/** The colours of palette entry `i`: on the dark glass and on a selected (white) card / the light theme. */
export function paletteColors(i: number): TagColors {
  const [h, l, c, fc, rc, oc, ofc] = TAG_PALETTE[i]!;
  return {
    bg: `oklch(${l} ${c} ${h} / 0.45)`,
    fg: `oklch(0.95 ${fc} ${h})`,
    ring: `oklch(${+(l + 0.12).toFixed(2)} ${rc} ${h} / 0.55)`,
    bgOn: `oklch(0.89 ${oc} ${h})`,
    fgOn: `oklch(0.45 ${ofc} ${h})`,
    ringOn: `oklch(0.45 ${ofc} ${h} / 0.22)`,
  };
}

/** The colours of a tag chip: on the dark glass and on a selected (white) card. */
export function tagColors(s: string, chosen?: TagColorMap | null): TagColors {
  return paletteColors(tagIndex(s, chosen));
}

/** Inline style (custom properties) for palette entry `i` on a `kh-tagc` element. */
export function paletteStyle(i: number): CSSProperties {
  const k = paletteColors(i);
  return {
    '--tg-bg': k.bg,
    '--tg-fg': k.fg,
    '--tg-ring': k.ring,
    '--tg-bg-on': k.bgOn,
    '--tg-fg-on': k.fgOn,
    '--tg-ring-on': k.ringOn,
  } as CSSProperties;
}

/** Inline style for an element with the `kh-tagc` class (in components: useTagStyle()). */
export function tagStyle(s: string, chosen?: TagColorMap | null): CSSProperties {
  return paletteStyle(tagIndex(s, chosen));
}

/** The chip fill on the dark glass (kept for callers that only set a background). */
export function tagTint(s: string, chosen?: TagColorMap | null): string {
  return tagColors(s, chosen).bg;
}

// Suggestions for the tag inputs (TagInput): the app's tags arrive most used
// first; matches at the start of the tag, then at the start of a word in it,
// then anywhere — that order kept within each group.
export type TagCount = { name: string; count: number };

/** Tags matching what is typed (start of a word first), without the ones already set. */
export function suggestTags(all: readonly TagCount[], query: string, exclude: readonly string[], max = 8) {
  const q = query.trim().toLowerCase();
  const ex = new Set(exclude.map((x) => x.toLowerCase()));
  const hits = all.filter((k) => !ex.has(k.name.toLowerCase()) && k.name.toLowerCase().includes(q));
  const rank = (k: TagCount) => {
    const n = k.name.toLowerCase();
    return n.startsWith(q) ? 0 : n.split(/[\s\-_/.]+/).some((w) => w.startsWith(q)) ? 1 : 2;
  };
  return hits
    .map((k, i) => ({ k, i, r: rank(k) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.k.name);
}
