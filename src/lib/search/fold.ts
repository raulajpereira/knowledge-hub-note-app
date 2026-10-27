// Accent- and case-insensitive matching for the global search, shared by the
// server (SQL) and the browser (highlighting the matched text). "reunião",
// "Reuniao" and "REUNIÃO" all fold to "reuniao". The fold keeps the length of
// precomposed (NFC) text, so a position found in the folded text is the same
// position in the original — that is what the highlight relies on.

/** One character folded: lower case, accents off (still one character). */
function foldChar(ch: string): string {
  const base = ch.normalize('NFD').replace(/\p{M}+/gu, '');
  const low = (base || ch).toLowerCase();
  return low.length === 1 ? low : (low[0] ?? ch);
}

/** Lower case without accents; same length as `s.normalize('NFC')`. */
export function fold(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) out += ch.length === 1 ? foldChar(ch) : ch;
  return out;
}

// The same fold in SQL, without folding every row (translate() over a big
// notebook takes seconds): a case-insensitive regex where each plain letter
// stands for its accented forms ("reuniao" → re[uU…ú]n[iI…í][aA…ã][oO…ó]),
// which Postgres runs at full speed on the unfolded text. The classes come
// from the Latin letters with accents (U+00C0–U+024F, U+1E00–U+1EFF) that
// fold to a plain a–z; letters without a decomposition (ß, ø, ł…) match
// only themselves on both sides.
const PAIRS: Array<[string, string]> = [];
for (let c = 0xc0; c <= 0x1eff; c++) {
  if (c > 0x24f && c < 0x1e00) continue;
  const ch = String.fromCharCode(c);
  const f = foldChar(ch);
  if (f !== ch && f !== ch.toLowerCase() && /^[a-z]$/.test(f)) PAIRS.push([ch, f]);
}
const CLASS: Record<string, string> = {};
for (const [ch, f] of PAIRS) CLASS[f] = (CLASS[f] ?? f + f.toUpperCase()) + ch;

/** Postgres regex (use with ~*) matching the folded `text` in unfolded text. */
export function accentRegex(text: string): string {
  let out = '';
  for (const ch of fold(text)) {
    const c = CLASS[ch];
    if (c) out += `[${c}]`;
    else if (/\s/.test(ch)) out += out.endsWith('\\s+') ? '' : '\\s+';
    else out += /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/** Longest query the global search reads. */
export const MAX_QUERY = 100;

/**
 * The words of a query, folded (at most 6, longest first so the most selective
 * one decides the match). Punctuation splits words except inside codes like
 * "DEVK900123", "S/4" or "BAPI_PO_CREATE1".
 */
export function searchTerms(q: string): string[] {
  const out: string[] = [];
  for (const raw of fold(q.slice(0, MAX_QUERY)).split(/[^\p{L}\p{N}_/.-]+/u)) {
    const w = raw.replace(/^[-/.]+|[-/.]+$/g, '');
    if (w && !out.includes(w)) out.push(w);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 6);
}

/** The [start, end) ranges of `text` where any of the (folded) terms appear, merged. */
export function matchRanges(text: string, terms: string[]): Array<[number, number]> {
  const f = fold(text);
  const r: Array<[number, number]> = [];
  for (const t of terms) {
    if (!t) continue;
    for (let i = f.indexOf(t); i >= 0; i = f.indexOf(t, i + t.length)) r.push([i, i + t.length]);
  }
  r.sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const x of r) {
    const last = out.at(-1);
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}

/** About `max` characters of `text` around the first match (whole words, "…" at cut ends). */
export function excerpt(text: string, terms: string[], max = 140): string {
  const t = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const first = matchRanges(t, terms)[0]?.[0] ?? 0;
  let start = Math.max(0, first - Math.floor(max / 3));
  if (start > 0) {
    const sp = t.indexOf(' ', start);
    if (sp >= 0 && sp < first) start = sp + 1;
  }
  let end = Math.min(t.length, start + max);
  if (end < t.length) {
    const sp = t.lastIndexOf(' ', end);
    if (sp > first) end = sp;
  }
  return `${start > 0 ? '…' : ''}${t.slice(start, end)}${end < t.length ? '…' : ''}`;
}
