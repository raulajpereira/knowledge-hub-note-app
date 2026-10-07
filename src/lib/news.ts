import type { NewsSource, SapNewsSource } from './prefs';

// Prototype defaults (kv.footer.src).
export const DEFAULT_NEWS_SOURCES: NewsSource[] = [
  { id: 'cnnpt', name: 'CNN Portugal', url: 'https://cnnportugal.iol.pt/rss', on: true },
  { id: 'cm', name: 'CM / CMTV', url: 'https://www.cmjornal.pt/rss', on: true },
  { id: 'jn', name: 'JN', url: 'https://www.jn.pt/rss/', on: true },
  { id: 'publico', name: 'Público', url: 'https://feeds.feedburner.com/PublicoRSS', on: true },
  { id: 'rtp', name: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss', on: true },
  { id: 'observador', name: 'Observador', url: 'https://observador.pt/feed/', on: true },
  { id: 'expresso', name: 'Expresso', url: 'https://expresso.pt/rss', on: true },
  { id: 'bbc', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', on: true },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', on: true },
  { id: 'cnn', name: 'CNN International', url: 'http://rss.cnn.com/rss/edition_world.rss', on: true },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', on: true },
];

/** SAP News page defaults (SapNews.dc.html NW_SRC). */
export const DEFAULT_SAP_NEWS_SOURCES: SapNewsSource[] = [
  {
    id: 'sapnews',
    name: 'SAP News Center',
    url: 'https://news.sap.com/feed/',
    color: 'oklch(0.76 0.15 245)',
    on: true,
  },
  {
    id: 'erptoday',
    name: 'ERP Today',
    url: 'https://erp.today/feed/',
    color: 'oklch(0.78 0.14 150)',
    on: true,
  },
  {
    id: 'saptech',
    name: 'SAP Tech Bytes (Developers)',
    url: 'https://community.sap.com/khhcw49343/rss/board?board.id=technology-blog-sap',
    color: 'oklch(0.75 0.14 305)',
    on: true,
  },
];
/** Colours given to sources the user adds (prototype onAdd). */
export const SAP_NEWS_COLORS = [
  'oklch(0.8 0.13 20)',
  'oklch(0.82 0.12 190)',
  'oklch(0.84 0.12 100)',
  'oklch(0.74 0.14 280)',
];
