import { describe, expect, it } from 'vitest';
import { parseArticles, sanitizeArticle } from '@/server/news/article';
import { PREF_SCHEMAS } from '@/lib/prefs';
import { DEFAULT_SAP_NEWS_SOURCES } from '@/lib/news';

const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[Novidades do SAP S/4HANA &amp; Cloud]]></title>
  <link>https://news.sap.com/2026/10/s4/</link>
  <pubDate>Tue, 06 Oct 2026 09:30:00 GMT</pubDate>
  <dc:creator>Ana Silva</dc:creator>
  <description>&lt;p&gt;Resumo &lt;b&gt;curto&lt;/b&gt;&lt;/p&gt;</description>
  <content:encoded><![CDATA[<p onclick="x()">Texto <a href="/rel/page">relativo</a> e <a href="javascript:alert(1)">mau</a></p>
    <img src="https://cdn.example.com/a.png" onerror="x()" style="width:9px"><script>alert(1)</script>
    <iframe src="https://evil"></iframe><img src="data:image/png;base64,AAA"><form><input></form>]]></content:encoded>
</item>
<item><title>Sem link</title></item>
</channel></rss>`;

const ATOM = `<feed><entry><title>RAP &amp; CDS</title><link rel="alternate" href="https://community.sap.com/t/1"/>
<updated>2026-10-07T08:00:00Z</updated><author><name>SAP Tech</name></author>
<summary>Resumo Atom</summary><media:thumbnail url="https://cdn.example.com/t.jpg"/></entry></feed>`;

describe('SAP News articles', () => {
  it('reads RSS items with author, date, first image and a sanitised body', () => {
    const [a, ...rest] = parseArticles(RSS, 'https://news.sap.com/feed/');
    expect(rest).toHaveLength(0); // items without a link are dropped
    expect(a).toMatchObject({
      title: 'Novidades do SAP S/4HANA & Cloud',
      link: 'https://news.sap.com/2026/10/s4/',
      date: '2026-10-06T09:30:00.000Z',
      author: 'Ana Silva',
      img: 'https://cdn.example.com/a.png',
      excerpt: 'Resumo curto',
    });
    expect(a!.html).toContain('href="https://news.sap.com/rel/page"');
    expect(a!.html).toContain('target="_blank"');
    expect(a!.html).toContain('referrerpolicy="no-referrer"');
    for (const bad of [
      'onclick',
      'onerror',
      'javascript:',
      '<script',
      '<iframe',
      'data:image',
      '<form',
      '<input',
      'style=',
    ])
      expect(a!.html).not.toContain(bad);
  });

  it('reads Atom entries', () => {
    const [a] = parseArticles(ATOM, 'https://community.sap.com/feed');
    expect(a).toMatchObject({
      title: 'RAP & CDS',
      link: 'https://community.sap.com/t/1',
      author: 'SAP Tech',
      img: 'https://cdn.example.com/t.jpg',
      excerpt: 'Resumo Atom',
    });
  });

  it('sanitiser keeps formatting and drops unsafe markup', () => {
    const h = sanitizeArticle(
      '<h3>T</h3><ul><li>a</li></ul><blockquote>q</blockquote><pre><code>x</code></pre><table><tr><td colspan="2">c</td></tr></table><svg><script>1</script></svg><a href="//evil.com/x">p</a>',
      'https://news.sap.com/a',
    );
    expect(h).toContain('<h3>T</h3><ul><li>a</li></ul><blockquote>q</blockquote><pre><code>x</code></pre>');
    expect(h).toContain('<td colspan="2">c</td>');
    expect(h).not.toContain('<svg');
    // protocol-relative links become absolute https links opening in a new tab
    expect(h).toContain(
      '<a href="https://evil.com/x" target="_blank" rel="noopener noreferrer nofollow">p</a>',
    );
  });

  it('source preferences are validated', () => {
    const S = PREF_SCHEMAS.sapNewsSources;
    expect(S.safeParse(DEFAULT_SAP_NEWS_SOURCES).success).toBe(true);
    const one = DEFAULT_SAP_NEWS_SOURCES[0]!;
    expect(S.safeParse([{ ...one, url: 'javascript:alert(1)' }]).success).toBe(false);
    expect(S.safeParse([{ ...one, color: 'red;background:url(x)' }]).success).toBe(false);
    expect(S.safeParse(Array.from({ length: 21 }, (_, i) => ({ ...one, id: `s${i}` }))).success).toBe(false);
  });
});
