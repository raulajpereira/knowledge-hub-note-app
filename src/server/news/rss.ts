// Minimal RSS 2.0 / Atom reader for the footer ticker: titles, links and
// dates only, so a full XML parser isn't needed. Output is plain text.

export type FeedItem = { title: string; link: string; t: number };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Same cleanup as the prototype's ftClean: CDATA, entities (twice), tags, whitespace. */
export function cleanText(s: string): string {
  let v = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  v = decodeEntities(decodeEntities(v));
  return v
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1]! : null;
}

function safeLink(raw: string | null): string {
  const v = raw ? cleanText(raw) : '';
  return /^https?:\/\//i.test(v) ? v : '';
}

export function parseFeed(xml: string, max = 8): FeedItem[] {
  const out: FeedItem[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
  if (items) {
    for (const it of items) {
      const title = cleanText(tag(it, 'title') ?? '');
      if (!title) continue;
      const date = tag(it, 'pubDate') ?? tag(it, 'dc:date') ?? '';
      out.push({ title, link: safeLink(tag(it, 'link')), t: Date.parse(cleanText(date)) || 0 });
    }
  } else {
    for (const it of xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
      const title = cleanText(tag(it, 'title') ?? '');
      if (!title) continue;
      const href =
        it.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
        it.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
        null;
      const date = tag(it, 'updated') ?? tag(it, 'published') ?? '';
      out.push({ title, link: safeLink(href), t: Date.parse(cleanText(date)) || 0 });
    }
  }
  return out.sort((a, b) => b.t - a.t).slice(0, max);
}

/** Round-robin across sources, newest first within each (prototype ftLoad). */
export function interleave<T>(lists: T[][], perSource = 8): T[] {
  const out: T[] = [];
  for (let i = 0; i < perSource; i++) for (const l of lists) if (l[i]) out.push(l[i]!);
  return out;
}
