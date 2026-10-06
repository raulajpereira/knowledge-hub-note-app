import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { effectivePrefs, parsePrefsPatch, prefAllowed } from '@/lib/prefs';
import { appearanceCss, appearanceOf } from '@/components/shell/appearance';
import { sniffImage } from '@/server/assets';

describe('appearance prefs', () => {
  it('validates values that end up in CSS', () => {
    expect(
      parsePrefsPatch({
        accent: '#12abEF',
        font: 'Manrope',
        uiScale: 1.1,
        bg: { mode: 'Grafite', blur: 40, dim: 35 },
      }),
    ).toBeTruthy();
    for (const bad of ['red;}body{display:none', 'oklch(1 1 1)', '#123', 'url(x)'])
      expect(() => parsePrefsPatch({ accent: bad })).toThrow(ZodError);
    expect(() => parsePrefsPatch({ font: 'Comic Sans' })).toThrow(ZodError);
    expect(() => parsePrefsPatch({ uiScale: 3 })).toThrow(ZodError);
    expect(() => parsePrefsPatch({ bg: { mode: 'photo', blur: 200, dim: 0 } })).toThrow(ZodError);
  });

  it('customisation keys need their add-on module', () => {
    const none = new Set<string>();
    expect(prefAllowed('font', 'Manrope', none)).toBe(false);
    expect(prefAllowed('font', 'Manrope', new Set(['typeface']))).toBe(true);
    expect(prefAllowed('accent', '#ffffff', none)).toBe(false);
    expect(prefAllowed('glassBlur', 10, none)).toBe(false);
    expect(prefAllowed('nav', [], none)).toBe(false);
    expect(prefAllowed('bg', { mode: 'Grafite' }, none)).toBe(true);
    expect(prefAllowed('bg', { mode: 'photo' }, none)).toBe(false);
    expect(prefAllowed('bg', { mode: 'photo' }, new Set(['bgphoto']))).toBe(true);
    expect(prefAllowed('uiScale', 1.1, none)).toBe(true);
  });

  it('a downgrade drops what the plan no longer covers', () => {
    const eff = effectivePrefs(
      { font: 'Outfit', accent: '#ff0000', uiScale: 1.1, bg: { mode: 'photo', blur: 10, dim: 5 } },
      new Set(),
    );
    expect(eff).toEqual({ uiScale: 1.1, bg: { mode: 'Areia', blur: 10, dim: 5 } });
  });

  it('builds the theme CSS', () => {
    expect(appearanceCss(appearanceOf({}))).toBe(
      ':root{--accent:oklch(0.76 0.17 245);--ui-scale:1}body{font-family:var(--font-geist-sans), system-ui, sans-serif}',
    );
    const css = appearanceCss(
      appearanceOf({ accent: '#112233', glassBlur: 12, font: 'Outfit', uiScale: 0.9, fontScale: 1.2 }),
    );
    expect(css).toContain('--accent:#112233');
    expect(css).toContain('--glass-blur-user:12px');
    expect(css).toContain("font-family:'Outfit Variable'");
    expect(css).toContain('zoom:0.9');
    expect(css).toContain('font-size-adjust:0.624');
  });
});

describe('image signatures', () => {
  it('accepts PNG/JPEG/WebP only', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
