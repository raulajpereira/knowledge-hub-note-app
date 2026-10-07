'use client';

// Thin fetch wrapper for the app's own API (basePath-aware, JSON, errors as
// { code, ... } from the server's { error: { code } } envelope).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export type ApiFailure = { code: string; status: number; retryAfter?: number };

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  let res: Response;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const init: RequestInit = {
    method,
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload,
    credentials: 'same-origin',
  };
  const url = `${BASE}/api/v1${path}`;
  // a save still in flight when the page is left or reloaded is not cancelled;
  // keepalive bodies share a 64 KB budget, so when it's full send it normally
  const keep = method !== 'GET' && payload !== undefined && payload.length < 60_000;
  try {
    res = keep
      ? await fetch(url, { ...init, keepalive: true }).catch(() => fetch(url, init))
      : await fetch(url, init);
  } catch {
    throw { code: 'network', status: 0 } satisfies ApiFailure;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; retryAfter?: number } }).error ?? {};
    throw { code: e.code ?? 'internal', status: res.status, retryAfter: e.retryAfter } satisfies ApiFailure;
  }
  return data as T;
}

export function isApiFailure(e: unknown): e is ApiFailure {
  return typeof e === 'object' && e !== null && 'code' in e && 'status' in e;
}
