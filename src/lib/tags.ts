// Prototype tagTint: a stable tint per tag name.
const TAG_TINTS = [
  'oklch(0.7 0.12 240 / .35)',
  'oklch(0.7 0.14 330 / .35)',
  'oklch(0.7 0.14 25 / .35)',
  'oklch(0.7 0.12 290 / .35)',
  'oklch(0.72 0.12 160 / .35)',
  'oklch(0.8 0.1 80 / .35)',
];
export function tagTint(s: string): string {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_TINTS[x % TAG_TINTS.length]!;
}

// Suggestions for the tag inputs (TagInput): the app's tags arrive most used
// first; matches at the start of the tag, then at the start of a word in it,
// then anywhere — that order kept within each group.
export type TagCount = { name: string; count: number };

/** Tags matching what is typed (start of a word first), without the ones already set. */
export function suggestTags(all: readonly TagCount[], query: string, exclude: readonly string[], max = 8) {
  const q = query.trim().toLowerCase();
  const ex = new Set(exclude.map((x) => x.toLowerCase()));
  const hits = all.filter((k) => !ex.has(k.name.toLowerCase()) && k.name.toLowerCase().includes(q));
  const rank = (k: TagCount) => {
    const n = k.name.toLowerCase();
    return n.startsWith(q) ? 0 : n.split(/[\s\-_/.]+/).some((w) => w.startsWith(q)) ? 1 : 2;
  };
  return hits
    .map((k, i) => ({ k, i, r: rank(k) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.k.name);
}
