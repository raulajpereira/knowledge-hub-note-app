import { describe, expect, it } from 'vitest';
import { FN, FN_PAGES, fnBlankRow, fnProgress, fnSchemas } from '@/lib/functional';

describe('functional model', () => {
  it('has the four pages of the prototype, each with rows', () => {
    expect(FN_PAGES).toEqual(['fn_proc', 'fn_test', 'fn_mig', 'fn_cut']);
    for (const p of FN_PAGES) expect(FN[p].rows.cols.length).toBeGreaterThan(0);
    expect(fnBlankRow('fn_test')).toEqual({ step: '', expected: '', st: 'todo' });
    expect(fnBlankRow('fn_mig')).toEqual({ src: '', dst: '', rule: '' });
  });

  it('progress: passed, done and not applicable count; only tests and cutover have it', () => {
    expect(fnProgress('fn_proc', [{ step: 'x' }])).toBeNull();
    expect(fnProgress('fn_test', [])).toEqual({ pct: 0, parts: [] });
    const p = fnProgress('fn_cut', [
      { st: 'done' },
      { st: 'run' },
      { st: 'todo' },
      { st: 'todo' },
      { st: 'skip' },
    ]);
    expect(p!.pct).toBe(40);
    expect(p!.parts.map((x) => [x.k, x.n])).toEqual([
      ['todo', 2],
      ['run', 1],
      ['done', 1],
      ['skip', 1],
    ]);
    expect(fnProgress('fn_test', [{ st: 'pass' }, { st: 'fail' }, {}])!.pct).toBe(33);
  });

  it('validates fields, statuses and rows per page', () => {
    const T = fnSchemas('fn_test');
    expect(
      T.f.safeParse({ module: 'SD', kind: 'UAT', cycle: 'SIT 1', date: '2026-10-05', pre: 'a\nb' }).success,
    ).toBe(true);
    expect(T.f.safeParse({ module: 'XX' }).success).toBe(false);
    expect(T.f.safeParse({ kind: 'Smoke' }).success).toBe(false);
    expect(T.f.safeParse({ date: '05/10/2026' }).success).toBe(false);
    expect(T.f.safeParse({ client: 'not-a-uuid' }).success).toBe(false);
    expect(T.f.safeParse({ golive: '2026-01-01' }).success).toBe(false); // other page's field
    expect(T.f.safeParse({ area: 'x\ny' }).success).toBe(false);
    expect(T.st.safeParse('pass').success).toBe(true);
    expect(T.st.safeParse('tobe').success).toBe(false);
    expect(T.rows.safeParse([{ step: 'a', st: 'fail' }]).success).toBe(true);
    expect(T.rows.safeParse([{ step: 'a', st: 'skip' }]).success).toBe(false); // skip is cutover only
    expect(T.rows.safeParse([{ nope: 'a' }]).success).toBe(false);
    const M = fnSchemas('fn_mig');
    expect(M.f.safeParse({ records: 18420, errors: '' }).success).toBe(true);
    expect(M.f.safeParse({ records: -1 }).success).toBe(false);
    expect(M.f.safeParse({ records: 1.5 }).success).toBe(false);
    expect(M.rows.safeParse(Array.from({ length: 501 }, () => ({}))).success).toBe(false);
  });
});
