import { Router } from 'express';
import Parser from 'rss-parser';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

// SAP's official newsroom feed plus community writing tagged ABAP on
// Medium. Best-effort fetch, same pattern as news.routes.js — a feed
// being down just means an empty/stale list, never a broken page.
const FEEDS = [
  { source: 'SAP News', url: 'https://news.sap.com/feed/' },
  { source: 'Medium ABAP', url: 'https://medium.com/feed/tag/abap' },
];

const parser = new Parser({
  timeout: 8000,
  // Some feeds reject unrecognized bot UAs — a normal browser UA is far
  // less likely to get blocked for what's just a public RSS fetch.
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
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
          content: fullText.slice(0, 700),
          publishedAt: item.isoDate || item.pubDate || null,
        };
      });
    })
  );
  const items = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items.push(...r.value);
    } else {
      const source = FEEDS[i].source;
      errors.push({ source, message: r.reason?.message || String(r.reason) });
      // Silently-swallowed feed failures previously left no trace anywhere,
      // so a genuinely broken feed (blocked, moved, TLS issue, ...) looked
      // identical to "nothing new published yet" — log it so it shows up
      // in `pm2 logs`.
      console.error(`[sap-news] ${source} feed failed:`, r.reason);
    }
  });
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return { items: items.slice(0, 60), errors };
}

const router = Router();
router.use(requireAuth);
router.use(requireFeature('sapNews'));

router.get('/', async (req, res) => {
  const now = Date.now();
  const force = req.query.force === 'true';
  let error = null;
  if (force || now - cache.fetchedAt > CACHE_MS) {
    try {
      const { items, errors } = await fetchAllFeeds();
      if (items.length > 0) {
        cache = { items, fetchedAt: now };
      } else if (errors.length > 0) {
        // Every feed failed this round — keep serving the stale cache, but
        // tell the client so a manual refresh doesn't look like a no-op.
        error = errors.map((e) => `${e.source}: ${e.message}`).join('; ');
      }
    } catch (err) {
      console.error('[sap-news] fetch failed:', err);
      error = err.message || 'Unknown error';
    }
  }
  res.json({ items: cache.items, fetchedAt: cache.fetchedAt, error });
});

router.get('/saved', async (req, res) => {
  const saved = await prisma.savedNews.findMany({ where: { userId: req.effectiveUserId }, orderBy: { createdAt: 'desc' } });
  res.json({ saved });
});

router.post('/saved', async (req, res) => {
  const { newsId, title, source, image, summary, content, link } = req.body || {};
  if (!newsId || !title || !link) return res.status(400).json({ error: 'newsId, title and link are required' });
  const saved = await prisma.savedNews.upsert({
    where: { userId_newsId: { userId: req.effectiveUserId, newsId } },
    update: {},
    create: { userId: req.effectiveUserId, newsId, title, source, image, summary, content, link },
  });
  res.status(201).json({ saved });
});

router.patch('/saved/:id', async (req, res) => {
  const existing = await prisma.savedNews.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!existing) return res.status(404).json({ error: 'Saved item not found' });
  const { read } = req.body || {};
  const saved = await prisma.savedNews.update({ where: { id: existing.id }, data: { read: read !== undefined ? !!read : existing.read } });
  res.json({ saved });
});

router.delete('/saved/:id', async (req, res) => {
  const existing = await prisma.savedNews.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!existing) return res.status(404).json({ error: 'Saved item not found' });
  await prisma.savedNews.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
