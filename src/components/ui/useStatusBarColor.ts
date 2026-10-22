'use client';

import { useEffect } from 'react';

// The phone's status bar (clock, battery). iOS draws the app under it
// (black-translucent, see layout.tsx), but Android paints it with the
// theme-color: match it to the top of the background so it doesn't show as
// a separate band. Photo: the average colour of its top strip, dimmed like the
// page; presets: their top colour. Light theme keeps the static colour.

type Rgb = [number, number, number];
const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const parse = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i]! * (1 - t) + b[i]! * t) as Rgb;

function setThemeColor(color: string) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length) metas.forEach((m) => (m.content = color));
  else {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = color;
    document.head.appendChild(m);
  }
}

/** Average colour of the top 10 % of the image (same-origin URL, so the canvas isn't tainted). */
function topColor(img: HTMLImageElement): Rgb | null {
  try {
    const w = 32;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w * 0.1));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * 0.1, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const sum: Rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k as 0 | 1 | 2] += d[i + k]!;
    const n = d.length / 4;
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  } catch {
    return null;
  }
}

export function useStatusBarColor(o: {
  photoUrl?: string | null;
  dim: number;
  /** preset: top colour of the gradient and the top-left blob that tints it */
  top: string;
  blob: string;
}) {
  const { photoUrl, dim, top, blob } = o;
  useEffect(() => {
    if (document.documentElement.getAttribute('data-theme') === 'light') return;
    const dimRgb: Rgb = [22, 16, 12];
    if (!photoUrl) {
      setThemeColor(hex(mix(parse(top), parse(blob), 0.45)));
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const c = topColor(img);
      if (c) setThemeColor(hex(mix(c, dimRgb, dim / 100)));
    };
    img.src = photoUrl;
    return () => {
      img.onload = null;
    };
  }, [photoUrl, dim, top, blob]);
}

/** Renders nothing: runs the hook where a server component can't. */
export function StatusBarColor(p: Parameters<typeof useStatusBarColor>[0]) {
  useStatusBarColor(p);
  return null;
}
