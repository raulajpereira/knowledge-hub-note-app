'use client';

// Thin fetch wrapper for the app's own API (basePath-aware, JSON, errors as
// { code, ... } from the server's { error: { code } } envelope).
import { announce, enqueue, queueable } from './offline';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Ambientes: the workspace this page was loaded in. Every request says it, so
// the server refuses (409 workspace_changed) when another tab switched the
// device's workspace meanwhile — nothing is ever saved in a workspace the page
// isn't showing (and the vault never uses one workspace's key in another).
let pageWorkspace: string | null = null;
export function setPageWorkspace(id: string | null) {
  pageWorkspace = id;
}

export type ApiFailure = {
  code: string;
  status: number;
  retryAfter?: number;
  siteKey?: string;
  /** the rest of the error's fields (e.g. `max` of limit_reached) */
  data?: Record<string, unknown>;
};

export function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  return request<T>(`${BASE}/api/v1${path}`, body, method);
}

/** The Admin Console's API (`/api/admin/v1`). */
export function adminApi<T = unknown>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  return request<T>(`${BASE}/api/admin/v1${path}`, body, method);
}

async function request<T>(url: string, body: unknown, method: string): Promise<T> {
  let res: Response;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string> = {};
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (pageWorkspace) headers['x-kh-ws'] = pageWorkspace;
  const init: RequestInit = {
    method,
    headers,
    body: payload,
    credentials: 'same-origin',
  };
  // a save still in flight when the page is left or reloaded is not cancelled;
  // keepalive bodies share a 64 KB budget, so when it's full send it normally
  const keep = method !== 'GET' && payload !== undefined && payload.length < 60_000;
  try {
    res = keep
      ? await fetch(url, { ...init, keepalive: true }).catch(() => fetch(url, init))
      : await fetch(url, init);
  } catch {
    // offline: an edit of a note or a task waits on this device and goes later
    const path = url.slice(`${BASE}/api/v1`.length);
    if (url.startsWith(`${BASE}/api/v1/`) && queueable(method, path) && body && typeof body === 'object') {
      await enqueue(path, body as Record<string, unknown>).catch(() => {});
      throw { code: 'offline_queued', status: 0 } satisfies ApiFailure;
    }
    announce(true);
    throw { code: 'network', status: 0 } satisfies ApiFailure;
  }
  // the service worker's copy (no connection): the shell says so
  announce(!!res.headers.get('x-kh-offline'));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e =
      (data as { error?: { code?: string; retryAfter?: number; siteKey?: string } & Record<string, unknown> })
        .error ?? {};
    // another tab switched workspace: show this one as it now is
    if (e.code === 'workspace_changed' && typeof window !== 'undefined') window.location.reload();
    // the combined view is read only (the shell shows why)
    if (e.code === 'combined_readonly' && typeof window !== 'undefined')
      window.dispatchEvent(new Event('kh-combined-ro'));
    throw {
      code: e.code ?? 'internal',
      status: res.status,
      retryAfter: e.retryAfter,
      siteKey: e.siteKey,
      data: e,
    } satisfies ApiFailure;
  }
  return data as T;
}

export function isApiFailure(e: unknown): e is ApiFailure {
  return typeof e === 'object' && e !== null && 'code' in e && 'status' in e;
}
