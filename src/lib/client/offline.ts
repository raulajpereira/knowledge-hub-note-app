'use client';

// Offline. Reading: the service worker (public/kh-sw.js) keeps a copy of the
// app's pages and of the Notas / Tarefas data and serves it without a
// connection. Editing: a change to an existing note or task that can't reach
// the server is kept here (IndexedDB "kh-offline") and sent when the
// connection is back; a note changed meanwhile on another device keeps both —
// the offline version becomes a copy ("(cópia offline)"). "Terminar sessão"
// clears the copies and the queue.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const API = `${BASE}/api/v1`;
export const OFFLINE_EVENT = 'kh-offline';
const DB = 'kh-offline';
const STORE = 'outbox';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const QUEUEABLE = new RegExp(`^/(notes|tasks)/${UUID}$`);

export type Queued = { path: string; body: Record<string, unknown>; base: string | null; at: number };

/** Edits that can wait for the connection: PATCH of an existing note or task. */
export const queueable = (method: string, path: string) => method === 'PATCH' && QUEUEABLE.test(path);

export function registerOffline() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register(`${BASE}/kh-sw.js`, { scope: `${BASE}/` }).catch(() => {});
}

function db(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'path' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, ko) => {
    const t = d.transaction(STORE, mode);
    const r = f(t.objectStore(STORE));
    t.oncomplete = () => {
      d.close();
      ok(r.result);
    };
    t.onerror = () => {
      d.close();
      ko(t.error);
    };
  });
}

export async function pending(): Promise<Queued[]> {
  try {
    const all = await tx<Queued[]>('readonly', (s) => s.getAll() as IDBRequest<Queued[]>);
    return all.sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

/** The note as this device last saw it (the service worker's copy): what the offline edit started from. */
async function seenAt(path: string): Promise<string | null> {
  if (!path.startsWith('/notes/') || typeof caches === 'undefined') return null;
  try {
    const hit = await caches.match(`${API}${path}`);
    const j = (await hit?.json()) as { note?: { updatedAt?: string } } | undefined;
    return j?.note?.updatedAt ?? null;
  } catch {
    return null;
  }
}

/** Keeps an edit for later (later edits of the same item are merged into it). */
export async function enqueue(path: string, body: Record<string, unknown>) {
  const old = (await tx<Queued | undefined>(
    'readonly',
    (s) => s.get(path) as IDBRequest<Queued | undefined>,
  ).catch(() => undefined)) as Queued | undefined;
  const q: Queued = old
    ? { ...old, body: { ...old.body, ...body } }
    : { path, body, base: await seenAt(path), at: Date.now() };
  await tx('readwrite', (s) => s.put(q));
  announce(true);
}

export function announce(offline: boolean) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail: { offline } }));
}

const send = async (path: string, method: string, body?: unknown) => {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.headers.get('x-kh-offline')) throw new Error('offline');
  return res;
};

let flushing: Promise<{ sent: number; copies: number; failed: number }> | null = null;

/** Sends what was kept, in order. A note changed elsewhere meanwhile: the offline version becomes a copy. */
export function flushOutbox() {
  flushing ??= (async () => {
    const out = { sent: 0, copies: 0, failed: 0 };
    for (const q of await pending()) {
      try {
        if (q.path.startsWith('/notes/') && q.base) {
          const cur = await send(q.path, 'GET');
          if (cur.status === 404) {
            await tx('readwrite', (s) => s.delete(q.path));
            continue;
          }
          const { note } = (await cur.json()) as {
            note: { title: string; folderId: string | null; updatedAt: string };
          };
          if (note.updatedAt > q.base) {
            const title = `${String(q.body.title ?? note.title) || '—'} (cópia offline)`.slice(0, 300);
            const made = await send('/notes', 'POST', { title, folderId: note.folderId });
            if (!made.ok) throw new Error('copy');
            const { note: copy } = (await made.json()) as { note: { id: string } };
            const rest = { ...q.body };
            delete rest.title;
            if (Object.keys(rest).length) await send(`/notes/${copy.id}`, 'PATCH', rest);
            await tx('readwrite', (s) => s.delete(q.path));
            out.copies++;
            continue;
          }
        }
        const r = await send(q.path, 'PATCH', q.body);
        // 4xx: it can never go (deleted, no longer allowed): dropped; 5xx: tried again later
        if (r.status >= 500) throw new Error(String(r.status));
        await tx('readwrite', (s) => s.delete(q.path));
        out.sent++;
      } catch {
        out.failed++;
        break; // still offline (or the server is down): keep the order, try later
      }
    }
    return out;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** "Terminar sessão": the copies kept on this device and the edits not sent are removed. */
export async function clearOffline() {
  try {
    navigator.serviceWorker?.controller?.postMessage('kh-clear');
    if (typeof caches !== 'undefined')
      for (const k of await caches.keys()) if (k.startsWith('kh-')) await caches.delete(k);
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase(DB);
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    });
  } catch {
    /* nothing kept */
  }
}

/** The notes most likely to be read offline: fetched once now (the service worker keeps them). */
export function warmNotes(ids: string[]) {
  if (typeof navigator === 'undefined' || !navigator.onLine || !navigator.serviceWorker?.controller) return;
  const key = `kh.warm.${ids.slice(0, 30).join(',').length}:${ids[0] ?? ''}`;
  try {
    if (sessionStorage.getItem('kh.warm') === key) return;
    sessionStorage.setItem('kh.warm', key);
  } catch {
    /* private mode */
  }
  let i = 0;
  const next = () => {
    const id = ids[i++];
    if (!id || i > 30 || !navigator.onLine) return;
    void fetch(`${API}/notes/${id}`, { credentials: 'same-origin' })
      .catch(() => {})
      .finally(() => setTimeout(next, 150));
  };
  setTimeout(next, 1500);
}
