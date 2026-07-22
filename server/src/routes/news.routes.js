import { Router } from 'express';
import Parser from 'rss-parser';
import { requireAuth } from '../middleware/auth.js';

// Mainly Portuguese outlets, plus a few international ones, all via public
// RSS feeds. Fetches are best-effort — a source being down or changing its
// feed URL just means fewer items, never a broken ticker.
const FEEDS = [
  { source: 'RTP', url: 'https://www.rtp.pt/noticias/rss' },
  { source: 'PÚBLICO', url: 'https://www.publico.pt/rss' },
  { source: 'DN', url: 'https://www.dn.pt/rss' },
  { source: 'JN', url: 'https://www.jn.pt/rss' },
  { source: 'CM', url: 'https://www.cmjornal.pt/rss' },
  { source: 'EXPRESSO', url: 'https://expresso.pt/rss/rss' },
  { source: 'OBSERVADOR', url: 'https://observador.pt/feed/' },
  { source: 'SIC NOTÍCIAS', url: 'https://sicnoticias.pt/rss' },
  { source: 'CNN PORTUGAL', url: 'https://cnnportugal.iol.pt/rss' },
  { source: 'BBC WORLD', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'THE GUARDIAN', url: 'https://www.theguardian.com/world/rss' },
  { source: 'DW', url: 'https://rss.dw.com/xml/rss-en-all' },
  { source: 'EURONEWS', url: 'https://www.euronews.com/rss' },
];

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeHubTicker/1.0)' },
});

const CACHE_MS = 15 * 60 * 1000;
let cache = { items: [], fetchedAt: 0 };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const feed = await parser.parseURL(f.url);
      return (feed.items || [])
        .slice(0, 3)
        .map((item) => ({ source: f.source, text: item.title?.trim(), link: item.link }))
        .filter((i) => i.text);
    })
  );
  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }
  return shuffle(items).slice(0, 40);
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
      // keep serving the stale cache (or empty list) if every feed failed
    }
  }
  res.json({ items: cache.items, fetchedAt: cache.fetchedAt });
});

export default router;
