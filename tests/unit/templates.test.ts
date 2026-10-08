import { describe, expect, it } from 'vitest';
import { FN } from '@/lib/functional';
import { BUILTIN_IDS, TPL_KINDS, builtinTemplates, fnToTpl, tplBodySchema } from '@/lib/templates';

describe('templates', () => {
  it('every ready-made template is valid in both languages', () => {
    let n = 0;
    for (const kind of TPL_KINDS)
      for (const lang of ['pt', 'en']) {
        const list = builtinTemplates(kind, lang);
        expect(list.length, `${kind} ${lang}`).toBeGreaterThan(0);
        for (const tpl of list) {
          const r = tplBodySchema(kind).safeParse(tpl.body);
          expect(r.success, `${tpl.id} ${lang}: ${r.error?.message}`).toBe(true);
          expect(tpl.name && tpl.desc).toBeTruthy();
          n++;
        }
      }
    expect(n).toBe(BUILTIN_IDS.length * 2);
  });

  it('a Functional record keeps only shareable fields and starts its rows over', () => {
    const tpl = fnToTpl('fn_cut', {
      title: 'Cutover X',
      code: 'GL',
      f: { client: '0190a0a0-0000-7000-8000-000000000000', golive: '2026-01-01', desc: 'notas' },
      rows: [{ act: 'a', when: 'T-1', who: 'eu', st: 'done' }],
    });
    expect(tpl).toEqual({
      title: 'Cutover X',
      code: 'GL',
      f: { desc: 'notas' },
      rows: [{ act: 'a', when: 'T-1', who: 'eu', st: 'todo' }],
    });
    expect(tplBodySchema('fn_cut').safeParse(tpl).success).toBe(true);
    // a client id can't be smuggled into a saved template
    expect(tplBodySchema('fn_cut').safeParse({ ...tpl, f: { client: 'x' } }).success).toBe(false);
    expect(FN.fn_cut.rows.cols.length).toBe(4);
  });

  it('project phases need a name and 1–104 weeks', () => {
    const S = tplBodySchema('project');
    expect(S.safeParse({ phases: [{ name: 'Explore', weeks: 8 }] }).success).toBe(true);
    expect(S.safeParse({ phases: [{ name: 'Explore', weeks: 0 }] }).success).toBe(false);
    expect(S.safeParse({ phases: [] }).success).toBe(false);
  });
});
