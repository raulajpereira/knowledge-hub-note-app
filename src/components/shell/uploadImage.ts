'use client';

import type { ApiFailure } from '@/lib/client/api';

// Prototype onFile / onLogo / pfOnPhoto: the browser scales the picture and
// re-encodes it (also turns SVG logos into PNG, so no SVG is ever stored).
type Kind = 'avatar' | 'background' | 'logo';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject({ code: 'unsupported_image', status: 0 } satisfies ApiFailure);
    };
    img.src = url;
  });
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject({ code: 'unsupported_image', status: 0 })), type, q),
  );
}

export async function encodeImage(kind: Kind, file: File): Promise<Blob> {
  const img = await load(file);
  const w = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  if (kind === 'avatar') {
    const z = 256;
    const m = Math.min(w, h);
    c.width = c.height = z;
    x.drawImage(img, (w - m) / 2, (h - m) / 2, m, m, 0, 0, z, z);
    return toBlob(c, 'image/jpeg', 0.86);
  }
  if (kind === 'logo') {
    const k = Math.min(1, 200 / h, 800 / w);
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    x.drawImage(img, 0, 0, c.width, c.height);
    return toBlob(c, 'image/png');
  }
  const k = Math.min(1, 2000 / Math.max(w, h));
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  x.drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, 'image/jpeg', 0.82);
}

/** Encodes and uploads; resolves to the new version (for the image URL). */
export async function uploadImage(kind: Kind, file: File): Promise<number> {
  const body = await encodeImage(kind, file);
  const res = await fetch(`${BASE}/api/v1/me/assets/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': body.type },
    body,
    credentials: 'same-origin',
  }).catch(() => {
    throw { code: 'network', status: 0 } satisfies ApiFailure;
  });
  const data = (await res.json().catch(() => ({}))) as { v?: number; error?: { code?: string } };
  if (!res.ok) throw { code: data.error?.code ?? 'internal', status: res.status } satisfies ApiFailure;
  return data.v!;
}

export async function removeImage(kind: Kind): Promise<void> {
  await fetch(`${BASE}/api/v1/me/assets/${kind}`, { method: 'DELETE', credentials: 'same-origin' });
}
