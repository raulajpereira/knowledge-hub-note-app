import 'server-only';
import sanitizeHtml from 'sanitize-html';
import { cleanText } from './rss';

// SAP News (SapNews.dc.html): full feed items — text, author, image and the
// article HTML. The HTML is sanitised here (allow-list, http/https links and
// images only, relative URLs resolved against the article) instead of the
// prototype's DOMParser clean-up in the browser.

export type Article = {
  id: string;
  title: string;
  link: string;
  /** ISO date or '' */
  date: string;
  author: string;
  img: string;
  excerpt: string;
  html: string;
};

const MAX_HTML = 200_000;

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1]! : null;
}
const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
/** Feed text fields hold escaped HTML (or CDATA): decode once to get the markup. */
const markup = (s: string | null) => {
  if (!s) return '';
  const v = unCdata(s);
  return /<[a-z!/]/i.test(v)
    ? v
    : v
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
};
function absUrl(raw: string | undefined | null, base: string): string {
  if (!raw) return '';
  try {
    const u = new URL(cleanText(raw), base || undefined);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Allow-list sanitiser for article bodies: formatting, lists, quotes, code, tables, links and images. */
export function sanitizeArticle(html: string, base: string): string {
  const out = sanitizeHtml(html.slice(0, MAX_HTML * 2), {
    allowedTags: [
      'p',
      'br',
      'hr',
      'a',
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'figure',
      'figcaption',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'sub',
      'sup',
      'small',
      'span',
      'div',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'loading', 'referrerpolicy'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_t, attrs) => {
        const href = absUrl(attrs.href, base);
        const attribs: Record<string, string> = href
          ? { href, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : {};
        return { tagName: 'a', attribs };
      },
      img: (_t, attrs) => ({
        tagName: 'img',
        attribs: {
          src: absUrl(attrs.src, base),
          alt: attrs.alt ?? '',
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        },
      }),
    },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    exclusiveFilter: (f) => f.tag === 'img' && !f.attribs.src,
  });
  return out.length > MAX_HTML ? out.slice(0, MAX_HTML) : out;
}

const firstImg = (h: string) => /<img[^>]+src=["']([^"']+)["']/i.exec(h)?.[1] ?? '';

/** RSS 2.0 / Atom → articles (prototype nwFetch, fallback branch). */
export function parseArticles(xml: string, feedUrl: string, max = 40): Article[] {
  const out: Article[] = [];
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const it of blocks.slice(0, max * 2)) {
    const title = cleanText(tag(it, 'title') ?? '');
    if (!title) continue;
    const linkRaw =
      tag(it, 'link') ||
      it.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
      it.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ||
      '';
    const link = absUrl(linkRaw, feedUrl);
    if (!link) continue;
    const raw = markup(
      tag(it, 'content:encoded') ?? tag(it, 'content') ?? tag(it, 'description') ?? tag(it, 'summary'),
    );
    const desc = markup(tag(it, 'description') ?? tag(it, 'summary')) || raw;
    const media =
      it.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i)?.[1] ??
      it.match(/<enclosure[^>]*type=["']image\/[^"']*["'][^>]*url=["']([^"']+)["']/i)?.[1] ??
      it.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1] ??
      firstImg(raw);
    const dateTxt = cleanText(
      tag(it, 'pubDate') ?? tag(it, 'published') ?? tag(it, 'updated') ?? tag(it, 'dc:date') ?? '',
    );
    const t = Date.parse(dateTxt);
    const author = cleanText(
      tag(it, 'dc:creator') ?? tag(tag(it, 'author') ?? '', 'name') ?? tag(it, 'author') ?? '',
    );
    out.push({
      id: cleanText(tag(it, 'guid') ?? tag(it, 'id') ?? '') || link,
      title: title.slice(0, 500),
      link,
      date: Number.isFinite(t) ? new Date(t).toISOString() : '',
      author: author.slice(0, 200),
      img: absUrl(media, link),
      excerpt: cleanText(desc).slice(0, 260),
      html: sanitizeArticle(raw, link),
    });
    if (out.length >= max) break;
  }
  return out;
}
