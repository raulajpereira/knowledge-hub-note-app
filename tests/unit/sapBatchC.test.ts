import { describe, expect, it } from 'vitest';
import { blockers, checkDeps, fmtDur, isBlocked, phaseOf, plan, wouldCycle } from '@/lib/cutover';
import { fnSchemas, withRowIds } from '@/lib/functional';
import { landscapes, nextSystem, routes, type LSystem } from '@/lib/landscape';
import { parseNoteNumbers, SapNoteFields, toCsv } from '@/lib/sapNotes';
import { builtinTemplates } from '@/lib/templates';

const row = (id: string, dur: number, dep: string[] = [], extra: Record<string, string> = {}) => ({
  id,
  act: id,
  dur: String(dur),
  dep: dep.join(','),
  st: 'todo',
  ...extra,
});

describe('cutover dependencies', () => {
  it('rejects missing predecessors, self-dependencies and cycles', () => {
    expect(checkDeps([row('aaaa', 60), row('bbbb', 60, ['aaaa'])])).toBeNull();
    expect(checkDeps([row('aaaa', 60, ['zzzz'])])?.code).toBe('cutover_dep_missing');
    expect(checkDeps([row('aaaa', 60, ['aaaa'])])?.code).toBe('cutover_dep_self');
    const cyc = checkDeps([row('aaaa', 60, ['cccc']), row('bbbb', 60, ['aaaa']), row('cccc', 60, ['bbbb'])]);
    expect(cyc?.code).toBe('cutover_cycle');
    // the picker never offers a predecessor that would close a loop
    const rs = [row('aaaa', 60), row('bbbb', 60, ['aaaa']), row('cccc', 60, ['bbbb'])];
    expect(wouldCycle(rs, 'aaaa', 'cccc')).toBe(true);
    expect(wouldCycle(rs, 'cccc', 'aaaa')).toBe(false);
  });

  it('blocks an activity until all its predecessors are done or not applicable', () => {
    const rs = [
      row('aaaa', 60, [], { st: 'done' }),
      row('bbbb', 60, [], { st: 'run' }),
      row('cccc', 30, ['aaaa', 'bbbb']),
    ];
    expect(isBlocked(rs, rs[2]!)).toBe(true);
    expect(blockers(rs, rs[2]!).map((r) => r.id)).toEqual(['bbbb']);
    rs[1]!.st = 'skip';
    expect(isBlocked(rs, rs[2]!)).toBe(false);
  });

  it('critical path: the longest chain of planned durations, with slack for the others', () => {
    const t0 = new Date('2026-11-06T18:00:00').getTime();
    // a(2h) → b(3h) → d(1h); a → c(1h) → d
    const rs = [
      row('aaaa', 120),
      row('bbbb', 180, ['aaaa']),
      row('cccc', 60, ['aaaa']),
      row('dddd', 60, ['bbbb', 'cccc']),
    ];
    const p = plan(rs, t0, t0)!;
    expect(p.path).toEqual(['aaaa', 'bbbb', 'dddd']);
    expect((p.end - t0) / 3600e3).toBe(6);
    expect(p.rows.get('cccc')!.critical).toBe(false);
    expect(p.rows.get('cccc')!.slack / 3600e3).toBe(2);
    expect(p.rows.get('dddd')!.es).toBe(t0 + 5 * 3600e3);
    // a planned start later than the predecessors pushes the chain
    const late = plan([...rs.slice(0, 3), { ...rs[3]!, start: '2026-11-07T08:00' }], t0, t0)!;
    expect(late.rows.get('dddd')!.es).toBe(new Date('2026-11-07T08:00:00').getTime());
    // late / at risk against now
    const now = t0 + 4 * 3600e3;
    const q = plan(rs, t0, now)!;
    expect(q.rows.get('aaaa')!.late).toBe(true);
    expect(q.rows.get('bbbb')!.risk).toBe(true);
    expect(q.rows.get('dddd')!.risk || q.rows.get('dddd')!.late).toBe(false);
    expect(plan([row('aaaa', 60, ['bbbb']), row('bbbb', 60, ['aaaa'])], t0)).toBeNull();
  });

  it('formats durations and reads the old "[Fase]" prefix', () => {
    expect(fmtDur(45)).toBe('45 min');
    expect(fmtDur(150)).toBe('2h30');
    expect(fmtDur(1500)).toBe('1 d 1h');
    expect(phaseOf({ act: '[Pré] Congelamento' })).toBe('Pré');
    expect(phaseOf({ act: 'x', phase: 'Hypercare' })).toBe('Hypercare');
  });

  it('rows get stable ids; cutover rows accept phase, start, duration and predecessors', () => {
    const a = withRowIds([{ step: 'a' }, { id: 'abcd', step: 'b' }, { id: 'abcd', step: 'c' }]);
    expect(new Set(a.map((r) => r.id)).size).toBe(3);
    expect(a[1]!.id).toBe('abcd');
    const S = fnSchemas('fn_cut').rows;
    expect(
      S.safeParse([{ id: 'abcd', phase: 'Pré', start: '2026-11-06T18:00', dur: '90', dep: 'efgh' }]).success,
    ).toBe(true);
    expect(S.safeParse([{ id: 'abcd', start: '06/11/2026' }]).success).toBe(false);
    expect(S.safeParse([{ id: 'abcd', dep: 'x;y' }]).success).toBe(false);
    expect(fnSchemas('fn_test').rows.safeParse([{ id: 'abcd', dep: 'efgh' }]).success).toBe(false);
  });

  it('the built-in cutover runbook comes with phases, durations and a valid dependency graph', () => {
    const tpl = builtinTemplates('fn_cut', 'pt').find((x) => x.id === 'b:cut-runbook')!;
    const rows = (tpl.body as { rows: Array<Record<string, string>> }).rows;
    expect(checkDeps(rows)).toBeNull();
    expect(rows[0]).toMatchObject({ id: 'cut01', phase: 'Pré', act: 'Congelamento de desenvolvimentos' });
    expect(plan(rows, Date.now())!.path.length).toBeGreaterThan(5);
  });
});

describe('landscape map', () => {
  const s = (id: string, sid: string, env: LSystem['env'], extra: Partial<LSystem> = {}): LSystem => ({
    id,
    sid,
    name: sid,
    env,
    clientId: 'c1',
    mandt: '100',
    track: '',
    nextId: null,
    ...extra,
  });
  const sys = [
    s('d', 'ECD', 'DEV'),
    s('q', 'ECQ', 'QAS'),
    s('p', 'ECP', 'PRD'),
    s('d2', 'BWD', 'DEV', { track: 'BW' }),
    s('p2', 'BWP', 'PRD', { track: 'BW', nextId: null }),
    s('x', 'SBX', 'SBX'),
  ];
  it('groups by client and track and follows the roles (or the explicit target)', () => {
    expect(landscapes(sys).map((l) => [l.track, l.systems.map((x) => x.sid)])).toEqual([
      ['', ['SBX', 'ECD', 'ECQ', 'ECP']],
      ['BW', ['BWD', 'BWP']],
    ]);
    expect(nextSystem(sys[0]!, sys)?.sid).toBe('ECQ');
    expect(nextSystem(sys[3]!, sys)).toBeNull(); // no QAS in the BW track
    const direct = sys.map((x) => (x.id === 'd2' ? { ...x, nextId: 'p2' } : x));
    expect(nextSystem(direct[3]!, direct)?.sid).toBe('BWP');
  });
  it('counts the requests waiting on each route', () => {
    const at = '2026-10-01T10:00:00Z';
    const tr = (id: string, step: Partial<Record<'releasedAt' | 'qasAt' | 'prdAt' | 'junkAt', string>>) => ({
      id,
      systemId: 'd',
      releasedAt: null,
      qasAt: null,
      prdAt: null,
      junkAt: null,
      ...step,
    });
    const r = routes(sys, [
      tr('t1', { releasedAt: at }),
      tr('t2', { releasedAt: at, qasAt: at }),
      tr('t3', { releasedAt: at, qasAt: at }),
      tr('t4', { releasedAt: at, qasAt: at, prdAt: at }),
      tr('t5', {}),
      tr('t6', { releasedAt: at, junkAt: at }),
    ]);
    const w = Object.fromEntries(r.map((e) => [`${e.from}>${e.to}`, e.waiting]));
    expect(w['d>q']).toEqual(['t1']);
    expect(w['q>p']).toEqual(['t2', 't3']);
  });
});

describe('SAP notes helpers', () => {
  it('reads note numbers from pasted text', () => {
    expect(parseNoteNumbers('SAP Note 3089413, 2998510\n0002998510; 3131059 x 0')).toEqual([
      3089413, 2998510, 3131059,
    ]);
  });
  it('validates the fields', () => {
    expect(SapNoteFields.partial().parse({ component: 'fi-gl' })).toEqual({ component: 'FI-GL' });
    expect(SapNoteFields.partial().safeParse({ component: 'FI GL' }).success).toBe(false);
    expect(SapNoteFields.partial().safeParse({ priority: 'urgent' }).success).toBe(false);
    expect(SapNoteFields.partial().safeParse({ number: 0 }).success).toBe(false);
  });
  it('CSV: semicolons, quotes and no formulas', () => {
    expect(toCsv([['a;b', '=SUM(A1)', 'x"y']])).toBe('﻿"a;b";\'=SUM(A1);"x""y"\r\n');
  });
});
