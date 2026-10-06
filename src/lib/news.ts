import type { NewsSource } from './prefs';

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
