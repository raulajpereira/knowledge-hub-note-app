import { describe, expect, it } from 'vitest';
import { accentRegex, excerpt, fold, matchRanges, searchTerms } from '@/lib/search/fold';

// Accent folding of the global search: the browser (highlight) and the SQL
// translate() table must agree, and the fold must keep positions.
describe('search fold', () => {
  it('folds case and accents, keeping the length', () => {
    expect(fold('Reunião ÀÇÕÉ')).toBe('reuniao acoe');
    const s = 'Configuração da Faturação — Ação';
    expect(fold(s)).toHaveLength(s.length);
    // decomposed input (macOS file names) is composed first
    expect(fold('reunião')).toBe('reuniao');
  });

  it('the SQL regex matches what the browser folds to the same text', () => {
    // Postgres ~* and JS /i agree on these patterns (bracket classes, \\s, escapes)
    const m = (text: string, q: string) => new RegExp(accentRegex(q), 'i').test(text);
    expect(accentRegex('a')).toMatch(/^\[aA.*ã.*\]$/);
    for (const t of ['Reunião', 'REUNIÃO', 'reuniao', 'Reúniâo']) expect(m(t, 'reuniao')).toBe(true);
    expect(m('Reunião', 'reunião')).toBe(true);
    expect(m('Faturação mensal', 'FATURACAO   mensal')).toBe(true);
    expect(m('reunir', 'reuniao')).toBe(false);
    // every accented letter of the range is matched by its plain letter
    for (const ch of 'áàâãäçéêèíìóôõòúùüñÁÀÂÃÇÉÊÍÓÔÕÚṕẽ') expect(m(ch, fold(ch))).toBe(true);
    // regex characters are plain text
    expect(accentRegex('100% (2).*')).toBe('100%\\s+\\(2\\)\\.\\*');
    expect(m('a.b', 'a.b')).toBe(true);
    expect(m('axb', 'a.b')).toBe(false);
  });

  it('splits a query into folded words, codes kept whole', () => {
    expect(searchTerms('  Reunião  de S/4 DEVK900123, BAPI_PO_CREATE1')).toEqual([
      'bapi_po_create1',
      'devk900123',
      'reuniao',
      's/4',
      'de',
    ]);
    expect(searchTerms('reu reu')).toEqual(['reu']);
    expect(searchTerms(' .. - ')).toEqual([]);
    expect(searchTerms('a b c d e f g h')).toHaveLength(6);
  });

  it('finds the ranges to highlight in the original text', () => {
    const t = 'A Reunião e a reuniao';
    expect(matchRanges(t, ['reuni']).map(([a, b]) => t.slice(a, b))).toEqual(['Reuni', 'reuni']);
    // overlapping words merge
    expect(matchRanges('faturação', ['fatur', 'turaç'.normalize('NFC')].map(fold))).toEqual([[0, 7]]);
    expect(matchRanges('abc', [])).toEqual([]);
  });

  it('cuts an excerpt around the first match', () => {
    const long = `${'antes '.repeat(40)}aqui está a reunião importante${' depois'.repeat(40)}`;
    const e = excerpt(long, ['reuniao'], 80);
    expect(e).toContain('reunião importante');
    expect(e.startsWith('…') && e.endsWith('…')).toBe(true);
    expect(e.length).toBeLessThanOrEqual(82);
    expect(excerpt('curto', ['x'])).toBe('curto');
  });
});
