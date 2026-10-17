import { createHash } from 'node:crypto';

// Pure helpers of semantic search, shared by the worker (indexing) and the web
// app (merging results): chunking, the content hash and reciprocal rank fusion.

/** ~450 tokens of Portuguese/English text for the multilingual model (≈3.5 chars a token). */
export const CHUNK_CHARS = 1600;
export const CHUNK_OVERLAP = 200;
/** at most this many chunks per item (≈38k characters): protects the small VPS */
export const MAX_CHUNKS = 24;

/** Whitespace collapsed, control characters out. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits text into overlapping chunks of about `size` characters, cutting at a
 * paragraph, sentence or word boundary when one is near. Deterministic: the
 * same text always gives the same chunks (chunk_no → excerpt in the web app).
 */
export function chunkText(
  text: string,
  { size = CHUNK_CHARS, overlap = CHUNK_OVERLAP, max = MAX_CHUNKS } = {},
): string[] {
  const t = cleanText(text);
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length && out.length < max) {
    let end = Math.min(t.length, start + size);
    if (end < t.length) {
      const lo = start + Math.floor(size * 0.6);
      const win = t.slice(lo, end);
      let at = -1;
      for (const d of ['\n\n', '\n', '. ', '! ', '? ', ' ']) {
        const i = win.lastIndexOf(d);
        if (i >= 0) {
          at = i + d.length;
          break;
        }
      }
      if (at > 0) end = lo + at;
    }
    const piece = t.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= t.length) break;
    // next chunk starts `overlap` characters back, at a word boundary
    let next = Math.max(end - overlap, start + 1);
    const sp = t.indexOf(' ', next);
    if (sp > 0 && sp < end) next = sp + 1;
    start = next;
  }
  return out;
}

/** Hash of a chunk (with the model: another model means other vectors). */
export function chunkHash(chunk: string, model: string): string {
  return createHash('sha256').update(model).update('\u0000').update(chunk).digest('base64url').slice(0, 32);
}

export type Ranked = { key: string };

/**
 * Reciprocal rank fusion: each list adds 1/(k + rank) to the items it holds,
 * so things found by both keyword and meaning rise, and either alone still
 * counts. Ties keep the first list's order (keyword first).
 */
export function rrf<T extends Ranked>(lists: T[][], k = 60): Array<T & { rrf: number }> {
  const score = new Map<string, { item: T; s: number; first: number }>();
  let seq = 0;
  for (const list of lists)
    list.forEach((item, rank) => {
      const cur = score.get(item.key);
      if (cur) cur.s += 1 / (k + rank + 1);
      else score.set(item.key, { item, s: 1 / (k + rank + 1), first: seq++ });
    });
  return [...score.values()]
    .sort((a, b) => b.s - a.s || a.first - b.first)
    .map(({ item, s }) => ({ ...item, rrf: s }));
}

/** A query worth embedding: at least one word of 3+ letters (or digits). */
export function semanticQuery(q: string): string | null {
  const t = q.trim().replace(/\s+/g, ' ').slice(0, 500);
  return /[\p{L}\p{N}]{3,}/u.test(t) ? t : null;
}
