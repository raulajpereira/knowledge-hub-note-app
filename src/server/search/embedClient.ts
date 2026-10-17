import { env } from '@/lib/env';
import { EMBED_AUTH_HEADER, embedToken } from '@/lib/search/embedAuth';

// Query vectors come from the worker (the web app never loads the model).
// Anything but a quick, well-formed answer → null, and the caller searches by
// keyword only: semantic search must never make a search fail or feel slow.

let downUntil = 0;

/** The vector of a search query, or null (off, slow, down). */
export async function embedQuery(text: string, timeoutMs = 300): Promise<number[] | null> {
  const e = env();
  if (!e.SEMANTIC_SEARCH || Date.now() < downUntil) return null;
  try {
    const res = await fetch(`${e.EMBED_URL.replace(/\/+$/, '')}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [EMBED_AUTH_HEADER]: embedToken(e.ENCRYPTION_KEY) },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // 503 = model still loading: try again soon, without waiting on it each time
      if (res.status !== 503) downUntil = Date.now() + 30_000;
      return null;
    }
    const j = (await res.json()) as { vector?: unknown };
    const v = j.vector;
    return Array.isArray(v) && v.length === 384 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
      ? (v as number[])
      : null;
  } catch (err) {
    // connection refused: no worker → don't try again for a while; a timeout only skips this query
    if (!(err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')))
      downUntil = Date.now() + 30_000;
    return null;
  }
}

/** Worker endpoint state for the settings status line. */
export async function embedHealth(): Promise<{ up: boolean; loaded: boolean; model?: string }> {
  const e = env();
  if (!e.SEMANTIC_SEARCH) return { up: false, loaded: false };
  try {
    const res = await fetch(`${e.EMBED_URL.replace(/\/+$/, '')}/health`, {
      headers: { [EMBED_AUTH_HEADER]: embedToken(e.ENCRYPTION_KEY) },
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return { up: false, loaded: false };
    const j = (await res.json()) as { loaded?: boolean; model?: string };
    return { up: true, loaded: !!j.loaded, model: j.model };
  } catch {
    return { up: false, loaded: false };
  }
}

/** Tests: forget a remembered outage. */
export function resetEmbedClient() {
  downUntil = 0;
}

/** pgvector literal of a vector. */
export const vecLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
