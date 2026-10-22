'use client';

import { api } from '@/lib/client/api';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Uploads a file to Ficheiros in chunks (the server's limit per request is
 * below the file sizes allowed): start, the parts one after the other, finish.
 * A failed upload is cancelled on the server; the error ({ code, status }) is
 * thrown. Used by Ficheiros and by /app/share.
 */
export async function driveUpload<F>(
  file: File,
  target: { folderId: string | null; sharedFolderId?: string },
  onSent?: (bytes: number) => void,
): Promise<F> {
  let uploadId: string | null = null;
  try {
    const s = await api<{ uploadId: string; partSize: number; parts: number }>('/drive/uploads', {
      name: file.name,
      size: file.size,
      mime: file.type || undefined,
      ...target,
    });
    uploadId = s.uploadId;
    for (let n = 1; n <= s.parts; n++) {
      const chunk = file.slice((n - 1) * s.partSize, n * s.partSize);
      const res = await fetch(`${BASE}/api/v1/drive/uploads/${s.uploadId}/${n}`, {
        method: 'PUT',
        body: chunk,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        throw { code: d.error?.code ?? 'internal', status: res.status };
      }
      onSent?.(Math.min(file.size, n * s.partSize));
    }
    const { file: f } = await api<{ file: F }>(`/drive/uploads/${s.uploadId}`, {});
    return f;
  } catch (e) {
    if (uploadId) void api(`/drive/uploads/${uploadId}`, undefined, 'DELETE').catch(() => {});
    throw e;
  }
}
