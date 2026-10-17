import { describe, expect, it } from 'vitest';
import { CHUNK_CHARS, chunkHash, chunkText, cleanText, rrf, semanticQuery } from '@/lib/search/text';
import { embedToken } from '@/lib/search/embedAuth';

describe('semantic search: chunking', () => {
  it('keeps short texts whole and drops empty ones', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
    expect(chunkText('  Olá   mundo \n\n\n fim ')).toEqual(['Olá mundo\n\nfim']);
  });

  it('cuts long texts into overlapping chunks at sentence boundaries', () => {
    const sentences = Array.from({ length: 80 }, (_, i) => `Frase número ${i} sobre faturas e clientes.`);
    const text = sentences.join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_CHARS);
      // each chunk ends at the end of a sentence (except the last, which ends the text)
      expect(c.endsWith('.')).toBe(true);
    }
    // consecutive chunks overlap (the next starts before the previous ended)
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i]!.slice(0, 40);
      expect(chunks[i - 1]!.includes(head)).toBe(true);
    }
    // everything is covered
    expect(chunks.at(-1)!.endsWith(sentences.at(-1)!)).toBe(true);
    // deterministic (chunk_no → excerpt in the web app)
    expect(chunkText(text)).toEqual(chunks);
  });

  it('caps the number of chunks per item', () => {
    const huge = 'palavra '.repeat(200_000);
    expect(chunkText(huge, { max: 5 }).length).toBe(5);
    expect(chunkText(huge).length).toBe(24);
  });

  it('cuts inside a word only when there is no space at all', () => {
    const chunks = chunkText('x'.repeat(4000));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.length).toBe(CHUNK_CHARS);
  });

  it('cleans control characters and runs of spaces', () => {
    expect(cleanText('a\u0000b\t\tc\r\n\n\n\nd')).toBe('a b c\n\nd');
  });
});

describe('semantic search: content hash', () => {
  it('changes with the text and with the model, not otherwise', () => {
    const a = chunkHash('Relatório Q3', 'm1');
    expect(chunkHash('Relatório Q3', 'm1')).toBe(a);
    expect(chunkHash('Relatório Q4', 'm1')).not.toBe(a);
    expect(chunkHash('Relatório Q3', 'm2')).not.toBe(a);
    expect(a).toMatch(/^[\w-]{32}$/);
  });

  it('skips unchanged chunks after an edit at the end', () => {
    const before = chunkText(Array.from({ length: 120 }, (_, i) => `Linha ${i} do email.`).join(' '));
    const after = chunkText(
      Array.from({ length: 120 }, (_, i) => `Linha ${i} do email.`).join(' ') + ' Uma frase nova.',
    );
    const h = (cs: string[]) => cs.map((c) => chunkHash(c, 'm'));
    const changed = h(after).filter((x, i) => h(before)[i] !== x);
    expect(changed.length).toBe(1);
  });
});

describe('semantic search: reciprocal rank fusion', () => {
  const k = (key: string) => ({ key });
  it('ranks items found by both lists first, keyword order on ties', () => {
    const out = rrf([
      [k('a'), k('b'), k('c')],
      [k('c'), k('d')],
    ]).map((x) => x.key);
    expect(out[0]).toBe('c'); // in both lists
    expect(out.slice(1)).toEqual(['a', 'b', 'd']); // b and d tie: keyword first
  });

  it('keeps keyword order when meaning adds nothing new', () => {
    expect(rrf([[k('a'), k('b')], []]).map((x) => x.key)).toEqual(['a', 'b']);
    expect(rrf([[], [k('x'), k('y')]]).map((x) => x.key)).toEqual(['x', 'y']);
  });

  it('scores are 1/(k+rank) summed', () => {
    const [top] = rrf([[k('a')], [k('a')]], 60);
    expect(top!.rrf).toBeCloseTo(2 / 61);
  });
});

describe('semantic search: queries and endpoint token', () => {
  it('embeds only queries with a real word', () => {
    expect(semanticQuery('ab')).toBeNull();
    expect(semanticQuery('  !! ')).toBeNull();
    expect(semanticQuery(' faturas   em atraso ')).toBe('faturas em atraso');
    expect(semanticQuery('Q3')).toBeNull();
    expect(semanticQuery('2026')).toBe('2026');
  });

  it('derives a stable token from the encryption key', () => {
    const a = embedToken('0'.repeat(64));
    expect(embedToken('0'.repeat(64))).toBe(a);
    expect(embedToken('1'.repeat(64))).not.toBe(a);
  });
});
