import { Router } from 'express';
import Parser from 'rss-parser';
import { requireAuth } from '../middleware/auth.js';

// SAP's official newsroom feed. Best-effort fetch, same pattern as
// news.routes.js — a feed being down just means an empty/stale list,
// never a broken page.
const FEEDS = [{ source: 'SAP News', url: 'https://news.sap.com/feed/' }];

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeHubSapNews/1.0)' },
  customFields: { item: [['content:encoded', 'contentEncoded'], 'enclosure'] },
});

const HTML_ENTITIES = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html) {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function extractImage(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  const html = item.contentEncoded || item.content || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

const CACHE_MS = 30 * 60 * 1000;
let cache = { items: [], fetchedAt: 0 };

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const feed = await parser.parseURL(f.url);
      return (feed.items || []).slice(0, 20).map((item) => {
        const fullText = stripTags(item.contentEncoded || item.content || item.summary || '');
        const snippet = item.contentSnippet ? decodeEntities(item.contentSnippet.trim()) : fullText;
        return {
          id: item.guid || item.link,
          source: f.source,
          title: decodeEntities((item.title || '').trim()),
          link: item.link,
          image: extractImage(item),
          summary: snippet.slice(0, 240),
          content: fullText,
          publishedAt: item.isoDate || item.pubDate || null,
        };
      });
    })
  );
  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return items.slice(0, 60);
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const now = Date.now();
  if (now - cache.fetchedAt > CACHE_MS) {
    try {
      const items = await fetchAllFeeds();
      if (items.length > 0) cache = { items, fetchedAt: now };
    } catch {
      // keep serving the stale cache (or empty list) if the feed failed
    }
  }
  res.json({ items: cache.items, fetchedAt: cache.fetchedAt });
});

export default router;
