import { describe, expect, it } from 'vitest';
import { docChecklist, docFileIds, docText, MAX_DOC_BYTES, safeUrl, validateDoc } from '@/server/content/doc';

// Phase 4.1: every note save goes through validateDoc on the server.
const FILE = '/api/v1/files/01a1125c-6200-7fbf-b108-59f8c2f2c40c';
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks }],
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'ok';
};

describe('validateDoc', () => {
  it('keeps the nodes the editor produces (Go-live note)', () => {
    const d = doc(
      p('Ver o ', [{ type: 'link', attrs: { href: 'https://help.sap.com', target: '_blank' } }]),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Checklist' }] },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [p('Transportar')] },
          { type: 'taskItem', attrs: { checked: false }, content: [p('Agendar job')] },
        ],
      },
      { type: 'image', attrs: { src: FILE, alt: 'SM59' } },
      { type: 'callout', content: [{ type: 'text', text: 'Verificar STRUST' }] },
      { type: 'linkCard', attrs: { href: 'https://me.sap.com', title: 'SAP for Me', sub: 'Notas SAP' } },
    );
    const v = validateDoc(d);
    expect(v.content).toHaveLength(6);
    // only href survives on links (target/rel are set by the renderer)
    expect(v.content![0]!.content![0]!.marks).toEqual([
      { type: 'link', attrs: { href: 'https://help.sap.com' } },
    ]);
    expect(docChecklist(v)).toEqual({ done: 1, total: 2 });
    expect(docFileIds(v)).toEqual(['01a1125c-6200-7fbf-b108-59f8c2f2c40c']);
    expect(docText(v)).toContain('SAP for Me');
  });

  it('refuses dangerous or foreign content', () => {
    expect(
      code(() => validateDoc(doc(p('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))),
    ).toBe('doc_invalid');
    expect(
      code(() => validateDoc(doc({ type: 'image', attrs: { src: 'https://evil.example/pixel.gif' } }))),
    ).toBe('doc_invalid');
    expect(
      code(() => validateDoc(doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } }))),
    ).toBe('doc_invalid');
    expect(code(() => validateDoc(doc({ type: 'image' })))).toBe('doc_invalid');
    expect(code(() => validateDoc(doc({ type: 'iframe', attrs: { src: 'https://x' } })))).toBe('doc_invalid');
    expect(code(() => validateDoc(doc(p('x', [{ type: 'textStyle' }]))))).toBe('doc_invalid');
    expect(code(() => validateDoc(doc({ type: 'linkCard', attrs: { href: 'javascript:x' } })))).toBe(
      'doc_invalid',
    );
    expect(code(() => validateDoc({ type: 'paragraph' }))).toBe('doc_invalid');
  });

  it('drops unknown attributes and non-scalar values', () => {
    const v = validateDoc(
      doc(
        { type: 'paragraph', attrs: { textAlign: 'left', onclick: 'x', style: 'color:red' } },
        {
          type: 'heading',
          attrs: { level: 9, textAlign: { evil: true } },
        },
      ),
    );
    expect(v.content![0]!.attrs).toEqual({ textAlign: 'left' });
    expect(v.content![1]!.attrs).toEqual({ level: 4 });
  });

  it('bounds size and depth', () => {
    expect(code(() => validateDoc(doc(p('x'.repeat(MAX_DOC_BYTES)))))).toBe('doc_too_large');
    let deep: Record<string, unknown> = { type: 'paragraph' };
    for (let i = 0; i < 50; i++) deep = { type: 'blockquote', content: [deep] };
    expect(code(() => validateDoc(doc(deep)))).toBe('doc_too_deep');
  });

  it('safeUrl: http(s), mailto (links), app-relative', () => {
    expect(safeUrl('https://a.pt/x', 'link')).toBe('https://a.pt/x');
    expect(safeUrl('mailto:a@b.pt', 'link')).toBe('mailto:a@b.pt');
    expect(safeUrl('/app/notes?n=1', 'link')).toBe('/app/notes?n=1');
    expect(safeUrl('//evil.example', 'link')).toBeNull();
    expect(safeUrl('data:text/html,x', 'link')).toBeNull();
    expect(safeUrl('mailto:a@b.pt', 'image')).toBeNull();
  });
});
