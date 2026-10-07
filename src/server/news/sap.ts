import 'server-only';
import { redis } from '@/lib/redis';
import { sha256 } from '@/lib/crypto';
import type { SapNewsSource } from '@/lib/prefs';
import { safeFetchText } from '@/server/net/safeFetch';
import { parseArticles, type Article } from './article';

// SAP News page: the server reads the user's SAP feeds (no rss2json /
// allorigins as in the prototype), keeps each feed 30 min in Redis and merges
// them newest first (max 120, one entry per link).

const TTL_S = 30 * 60;
const FAIL_TTL_S = 5 * 60;

export type NewsItem = Article & { src: string };

async function loadFeed(url: string, fresh: boolean): Promise<Article[] | null> {
  const key = `kh:rssa:${sha256(url).toString('hex')}`;
  if (!fresh) {
    try {
      const cached = await redis().get(key);
      if (cached) return JSON.parse(cached) as Article[] | null;
    } catch {
      // cache unavailable: fetch directly
    }
  }
  let items: Article[] | null = null;
  try {
    const r = await safeFetchText(url);
    if (r.status >= 200 && r.status < 300) items = parseArticles(r.body, url);
  } catch {
    items = null;
  }
  try {
    await redis().set(key, JSON.stringify(items), 'EX', items?.length ? TTL_S : FAIL_TTL_S);
  } catch {
    // ignore
  }
  return items;
}

export async function sapNewsFor(sources: SapNewsSource[], fresh = false) {
  const on = sources.filter((s) => s.on).slice(0, 20);
  const lists = await Promise.all(on.map((s) => loadFeed(s.url, fresh)));
  const seen = new Set<string>();
  const items: NewsItem[] = lists
    .flatMap((l, i) => (l ?? []).map((a) => ({ ...a, src: on[i]!.id })))
    .filter((x) => !seen.has(x.link) && !!seen.add(x.link))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .slice(0, 120);
  return {
    items,
    failed: on.filter((_, i) => !lists[i]?.length).map((s) => s.name),
    ts: new Date().toISOString(),
  };
}
