import { describe, expect, it } from 'vitest';
import { suggestTags, tagColors, tagIndex, tagStyle, TAG_PALETTE } from '@/lib/tags';

const ALL = [
  { name: 'SAP', count: 9 },
  { name: 'go-live', count: 5 },
  { name: 'Migração SAP', count: 4 },
  { name: 'api', count: 3 },
  { name: 'Usap', count: 1 },
];

describe('tag suggestions', () => {
  it('lists the most used first when nothing is typed, without the tags already set', () => {
    expect(suggestTags(ALL, '', ['api'])).toEqual(['SAP', 'go-live', 'Migração SAP', 'Usap']);
  });
  it('ranks the start of the tag, then of a word, then anywhere — case-insensitive', () => {
    expect(suggestTags(ALL, 'sap', [])).toEqual(['SAP', 'Migração SAP', 'Usap']);
    expect(suggestTags(ALL, 'LIVE', [])).toEqual(['go-live']);
  });
  it('excludes regardless of case and caps the list', () => {
    expect(suggestTags(ALL, 'sap', ['sap'])).toEqual(['Migração SAP', 'Usap']);
    expect(suggestTags(ALL, '', [], 2)).toEqual(['SAP', 'go-live']);
  });
});

// oklch → sRGB (0–1), then WCAG contrast; alpha fills are blended in sRGB
// like the browser does.
const parse = (c: string) => {
  const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(c);
  if (!m) throw new Error(c);
  return { l: +m[1]!, c: +m[2]!, h: +m[3]!, a: m[4] ? +m[4] : 1 };
};
const lin = (L: number, C: number, h: number) => {
  const a = C * Math.cos((h * Math.PI) / 180),
    b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};
const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (c: string, under: number[] = [0, 0, 0]) => {
  const k = parse(c);
  return lin(k.l, k.c, k.h).map((v, i) => enc(v) * k.a + under[i]! * (1 - k.a));
};
const lum = (x: number[]) => 0.2126 * dec(x[0]!) + 0.7152 * dec(x[1]!) + 0.0722 * dec(x[2]!);
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);

describe('tag colours', () => {
  it('gives the same colour to the same tag (any case) and spreads tags over the palette', () => {
    expect(tagColors('SAP')).toEqual(tagColors('sap'));
    expect(tagStyle('go-live')).toEqual(tagStyle('go-live'));
    const used = new Set(
      ['SAP', 'go-live', 'api', 'Fase 2', 'utils', 'async', 'abap', 'infra', 'rh', 'docs'].map(tagIndex),
    );
    expect(used.size).toBeGreaterThanOrEqual(5);
  });
  it('keeps every colour inside sRGB and vivid', () => {
    for (const [h, l, c] of TAG_PALETTE) {
      expect(lin(l, c, h).every((v) => v >= -1e-3 && v <= 1 + 1e-3)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0.11);
    }
  });
  it('reads at ≥ 4.5:1 on the dark glass and on a selected (white) card', () => {
    for (let i = 0; i < TAG_PALETTE.length; i++) {
      const name = Array.from({ length: 400 }, (_, n) => `t${n}`).find((n) => tagIndex(n) === i)!;
      const k = tagColors(name);
      for (const glass of ['#1c1512', '#4a3d35'])
        expect(contrast(rgb(k.fg), rgb(k.bg, hex(glass)))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(k.fgOn), rgb(k.bgOn))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
