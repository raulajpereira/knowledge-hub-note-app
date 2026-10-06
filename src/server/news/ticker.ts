import 'server-only';
import { redis } from '@/lib/redis';
import { sha256 } from '@/lib/crypto';
import type { NewsSource } from '@/lib/prefs';
import { safeFetchText } from '@/server/net/safeFetch';
import { interleave, parseFeed, type FeedItem } from './rss';

// Footer ticker (prototype ftLoad): the server fetches each enabled RSS
// source (no third-party proxies like rss2json/allorigins), caches it in
// Redis for 15 min and interleaves the newest items.

const TTL_S = 15 * 60;
const FAIL_TTL_S = 5 * 60;

export { DEFAULT_NEWS_SOURCES } from '@/lib/news';

export type TickerItem = FeedItem & { src: string };

async function loadFeed(url: string): Promise<FeedItem[] | null> {
  const key = `kh:rss:${sha256(url).toString('hex')}`;
  try {
    const cached = await redis().get(key);
    if (cached) return JSON.parse(cached) as FeedItem[] | null;
  } catch {
    // cache unavailable: fetch directly
  }
  let items: FeedItem[] | null = null;
  try {
    const r = await safeFetchText(url);
    if (r.status >= 200 && r.status < 300) items = parseFeed(r.body);
  } catch {
    items = null;
  }
  try {
    await redis().set(key, JSON.stringify(items), 'EX', items && items.length ? TTL_S : FAIL_TTL_S);
  } catch {
    // ignore
  }
  return items;
}

export async function tickerFor(sources: NewsSource[]): Promise<{ items: TickerItem[]; failed: string[] }> {
  const on = sources.filter((s) => s.on).slice(0, 30);
  const lists = await Promise.all(on.map((s) => loadFeed(s.url)));
  const tagged = lists.map((l, i) => (l ?? []).map((it) => ({ ...it, src: on[i]!.name })));
  return {
    items: interleave(tagged),
    failed: on.filter((_, i) => !lists[i]?.length).map((s) => s.name),
  };
}
