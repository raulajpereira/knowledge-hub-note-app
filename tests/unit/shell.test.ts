import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { mergePrefs, parsePrefsPatch } from '@/lib/prefs';
import { defaultNav, hrefOf, idFromSegment, normalizeNav, sideRows } from '@/components/shell/nav';
import { cleanText, interleave, parseFeed } from '@/server/news/rss';
import { isPrivateAddress } from '@/server/net/safeFetch';
import { deviceLabel } from '@/components/shell/AccountModal';
import { initials, tierGradient } from '@/components/shell/plan';

describe('user prefs patch', () => {
  it('accepts known keys and ui.* values, null deletes', () => {
    const p = parsePrefsPatch({ cols: { side: 300 }, 'ui.issues.cols': { a: 120 }, nav: null });
    expect(p).toEqual({ cols: { side: 300 }, 'ui.issues.cols': { a: 120 }, nav: null });
    expect(mergePrefs({ nav: [], cols: { side: 200 } }, p)).toEqual({
      cols: { side: 300 },
      'ui.issues.cols': { a: 120 },
    });
  });
  it('refuses unknown keys, out-of-range widths and oversized ui values', () => {
    expect(() => parsePrefsPatch({ isAdmin: true })).toThrow('pref_unknown_key');
    expect(() => parsePrefsPatch({ cols: { side: 5000 } })).toThrow(ZodError);
    expect(() => parsePrefsPatch({ 'ui.x': 'a'.repeat(9000) })).toThrow('pref_too_large');
    expect(() =>
      parsePrefsPatch({ newsSources: [{ id: 'x', name: 'x', url: 'javascript:alert(1)', on: true }] }),
    ).toThrow(ZodError);
    expect(() => parsePrefsPatch({ nav: [{ type: 'item', id: '../etc' }] })).toThrow(ZodError);
  });
});

describe('sidebar model', () => {
  const t = (k: string) => k;
  const all = new Set(defaultNav().flatMap((e) => (e.type === 'item' ? [e.id] : [])));

  it('shows every item for a plan with everything', () => {
    const rows = sideRows(defaultNav(), all, t);
    expect(rows.filter((r) => r.kind === 'item')).toHaveLength(all.size);
    expect(rows.filter((r) => r.kind === 'group').map((r) => r.kind === 'group' && r.name)).toEqual([
      'Management',
      'SAP',
    ]);
  });

  it('FREE (notes, tasks): only licensed items; empty groups and stray spacers disappear', () => {
    const rows = sideRows(defaultNav(), new Set(['notes', 'tasks']), t);
    expect(rows.map((r) => (r.kind === 'item' ? r.id : r.kind))).toEqual([
      'home',
      'notes',
      'tasks',
      'spacer',
      'tags',
    ]);
  });

  it('collapsed group keeps its header but hides its nested items', () => {
    const nav = defaultNav().map((e) => (e.type === 'group' && e.name === 'SAP' ? { ...e, open: false } : e));
    const rows = sideRows(nav, all, t);
    expect(rows.some((r) => r.kind === 'item' && r.id === 'systems')).toBe(false);
    expect(rows.some((r) => r.kind === 'group' && r.name === 'SAP')).toBe(true);
    expect(rows.some((r) => r.kind === 'item' && r.id === 'tags')).toBe(true);
  });

  it('normalizes saved layouts: unknown/duplicate ids dropped, missing ones appended', () => {
    const n = normalizeNav([
      { type: 'item', id: 'notes' },
      { type: 'item', id: 'notes' },
      { type: 'item', id: 'contacts' },
      { type: 'item', id: 'bogus' },
    ]);
    const ids = n.flatMap((e) => (e.type === 'item' ? [e.id] : []));
    expect(ids[0]).toBe('notes');
    expect(ids.filter((i) => i === 'notes')).toHaveLength(1);
    expect(ids).not.toContain('contacts');
    expect(ids).not.toContain('bogus');
    expect(ids).toContain('home');
  });

  it('user labels and hidden items are respected', () => {
    const nav = defaultNav().map((e) =>
      e.type === 'item' && e.id === 'notes'
        ? { ...e, label: 'Apontamentos' }
        : e.type === 'item' && e.id === 'tasks'
          ? { ...e, hidden: true }
          : e,
    );
    const rows = sideRows(nav, all, t);
    expect(rows.find((r) => r.kind === 'item' && r.id === 'notes')).toMatchObject({ label: 'Apontamentos' });
    expect(rows.some((r) => r.kind === 'item' && r.id === 'tasks')).toBe(false);
  });

  it('routes', () => {
    expect(hrefOf('home')).toBe('/app');
    expect(hrefOf('mg_overview')).toBe('/app/mg-overview');
    expect(idFromSegment('fn-proc')).toBe('fn_proc');
  });
});

describe('footer ticker feeds', () => {
  it('parses RSS 2.0 with CDATA, entities and tags; drops non-http links', () => {
    const xml = `<rss><channel><title>X</title>
      <item><title><![CDATA[Olá &amp; <b>adeus</b>]]></title><link>https://a.pt/1</link><pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>Mais &#233; menos</title><link>javascript:alert(1)</link><pubDate>Tue, 06 Oct 2026 11:00:00 GMT</pubDate></item>
    </channel></rss>`;
    expect(parseFeed(xml)).toEqual([
      { title: 'Mais é menos', link: '', t: Date.parse('2026-10-06T11:00:00Z') },
      { title: 'Olá & adeus', link: 'https://a.pt/1', t: Date.parse('2026-10-06T10:00:00Z') },
    ]);
  });
  it('parses Atom', () => {
    const xml = `<feed><entry><title>A</title><link rel="alternate" href="https://b.pt/a"/><updated>2026-10-06T09:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml)).toEqual([
      { title: 'A', link: 'https://b.pt/a', t: Date.parse('2026-10-06T09:00:00Z') },
    ]);
  });
  it('cleans double-escaped text and interleaves sources', () => {
    expect(cleanText('&amp;lt;b&amp;gt; x')).toBe('x');
    expect(interleave([[1, 2, 3], [10], [20, 21]])).toEqual([1, 10, 20, 2, 21, 3]);
  });
});

describe('SSRF guard', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.5', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['::ffff:127.0.0.1', true],
    // the URL parser writes mapped addresses in hex: [::ffff:127.0.0.1] → ::ffff:7f00:1
    ['::ffff:7f00:1', true],
    ['::ffff:a9fe:a9fe', true],
    ['::ffff:ac11:1', true],
    ['::ffff:808:808', false],
    ['::', true],
    ['::7f00:1', true],
    ['64:ff9b::a9fe:a9fe', true],
    ['2002:7f00:1::1', true],
    ['2001:0:4136::1', true],
    ['2001:db8::1', true],
    ['100::1', true],
    ['ff02::1', true],
    ['::ffff:0:0:7f00:1', true],
    ['8.8.8.8', false],
    ['151.101.1.140', false],
    ['2a00:1450:4003:80e::200e', false],
  ])('%s private=%s', (ip, priv) => expect(isPrivateAddress(ip)).toBe(priv));
});

describe('account helpers', () => {
  it('device labels', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome · macOS', phone: false });
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile Safari/604.1',
      ),
    ).toEqual({
      label: 'Safari · iOS',
      phone: true,
    });
    expect(deviceLabel(null)).toBeNull();
  });
  it('initials and tier gradients', () => {
    expect(initials('Raul Alexandre Pereira')).toBe('RP');
    expect(initials('ana')).toBe('A');
    expect(tierGradient('ULTRA')).toMatch(/oklch/);
    expect(tierGradient('UNKNOWN')).toBe(tierGradient('ULTRA'));
  });
});
