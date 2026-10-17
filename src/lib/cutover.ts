// Cutover runbook (Funcional › Cutover): dependencies between the activities of
// one runbook, "blocked" activities and the critical path. Shared by the client
// (list, timeline) and the server (dependencies must exist and form no cycle).
//
// Rows keep their extra data as strings (FnRow): `id` (stable row id), `phase`,
// `start` (planned start, local "YYYY-MM-DDTHH:MM"), `dur` (planned minutes),
// `dep` (ids of the predecessors, comma-separated) and `st` (todo/run/done/skip).
import type { FnRow } from './functional';

export const depsOf = (r: FnRow): string[] => (r.dep ? r.dep.split(',').filter(Boolean) : []);
export const durOf = (r: FnRow): number => {
  const n = Number(r.dur);
  return r.dur && Number.isFinite(n) && n > 0 ? n : 0;
};
/** Done or not applicable: a successor may start. */
export const isFinished = (r: FnRow) => r.st === 'done' || r.st === 'skip';

export type DepProblem = { code: 'cutover_dep_missing' | 'cutover_dep_self' | 'cutover_cycle'; row: string };

/** Every predecessor exists in the same runbook, none is the row itself, and there is no cycle. */
export function checkDeps(rows: FnRow[]): DepProblem | null {
  const ids = new Set(rows.map((r) => r.id).filter(Boolean));
  for (const r of rows)
    for (const d of depsOf(r)) {
      if (d === r.id) return { code: 'cutover_dep_self', row: r.id ?? '' };
      if (!ids.has(d)) return { code: 'cutover_dep_missing', row: r.id ?? '' };
    }
  const done = kahn(rows);
  if (done.length === rows.length) return null;
  return { code: 'cutover_cycle', row: rows.find((r) => !done.includes(r))?.id ?? '' };
}

/** Rows in an order where predecessors come first, or null when there is a cycle. */
export function topoOrder(rows: FnRow[]): FnRow[] | null {
  const out = kahn(rows);
  return out.length === rows.length ? out : null;
}
/** Kahn's algorithm: the rows that can be ordered (those in or after a cycle are left out). */
function kahn(rows: FnRow[]): FnRow[] {
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id!, r]));
  const indeg = new Map<FnRow, number>();
  const next = new Map<FnRow, FnRow[]>();
  for (const r of rows) indeg.set(r, 0);
  for (const r of rows)
    for (const d of new Set(depsOf(r))) {
      const p = byId.get(d);
      if (!p) continue;
      indeg.set(r, indeg.get(r)! + 1);
      next.set(p, [...(next.get(p) ?? []), r]);
    }
  const queue = rows.filter((r) => indeg.get(r) === 0);
  const out: FnRow[] = [];
  while (queue.length) {
    const r = queue.shift()!;
    out.push(r);
    for (const s of next.get(r) ?? []) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  return out;
}

/** Would adding `pred` as a predecessor of `row` close a loop? (for the dependency picker) */
export function wouldCycle(rows: FnRow[], row: string, pred: string): boolean {
  if (row === pred) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  // is `row` already an ancestor of `pred`?
  const seen = new Set<string>();
  const stack = [pred];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === row) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...depsOf(byId.get(id) ?? {}));
  }
  return false;
}

/** Predecessors not finished yet: the activity is "Bloqueada" while there are any. */
export function blockers(rows: FnRow[], r: FnRow): FnRow[] {
  const byId = new Map(rows.map((x) => [x.id, x]));
  return depsOf(r)
    .map((d) => byId.get(d))
    .filter((p): p is FnRow => !!p && !isFinished(p));
}
export const isBlocked = (rows: FnRow[], r: FnRow) => !isFinished(r) && blockers(rows, r).length > 0;

/** Local "YYYY-MM-DDTHH:MM" → epoch ms (NaN when empty or invalid). */
export const parseLocal = (s: string | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00`).getTime() : NaN;
export const toLocal = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type Planned = {
  id: string;
  /** earliest start / finish (ms) */
  es: number;
  ef: number;
  /** latest start / finish without delaying the end of the runbook */
  ls: number;
  lf: number;
  slack: number;
  critical: boolean;
  /** late: should have finished by now · risk: should have started and hasn't */
  late: boolean;
  risk: boolean;
};
export type Plan = {
  rows: Map<string, Planned>;
  start: number;
  end: number;
  /** ids of the critical path, in order */
  path: string[];
};

const MIN = 60_000;

/**
 * Critical path method on the planned durations: an activity starts at its
 * planned start or when its last predecessor finishes, whichever is later
 * (rows without a planned start and without predecessors start with the
 * runbook, at `origin` or the earliest planned start). The critical path is
 * the chain of zero-slack activities that ends last. Null when there is a cycle.
 */
export function plan(rows: FnRow[], origin: number, now = Date.now()): Plan | null {
  const order = topoOrder(rows.filter((r) => r.id));
  if (!order) return null;
  const starts = order.map((r) => parseLocal(r.start)).filter((x) => Number.isFinite(x));
  const t0 = starts.length ? Math.min(origin, ...starts) : origin;
  const out = new Map<string, Planned>();
  for (const r of order) {
    const own = parseLocal(r.start);
    const preds = depsOf(r)
      .map((d) => out.get(d))
      .filter(Boolean) as Planned[];
    const es = Math.max(Number.isFinite(own) ? own : t0, ...preds.map((p) => p.ef));
    const ef = es + durOf(r) * MIN;
    out.set(r.id!, { id: r.id!, es, ef, ls: 0, lf: 0, slack: 0, critical: false, late: false, risk: false });
  }
  const end = Math.max(t0, ...[...out.values()].map((p) => p.ef));
  // backward pass
  const succ = new Map<string, string[]>();
  for (const r of order) for (const d of depsOf(r)) succ.set(d, [...(succ.get(d) ?? []), r.id!]);
  for (const r of [...order].reverse()) {
    const p = out.get(r.id!)!;
    const ss = (succ.get(r.id!) ?? []).map((s) => out.get(s)!);
    p.lf = ss.length ? Math.min(...ss.map((s) => s.ls)) : end;
    p.ls = p.lf - durOf(r) * MIN;
    p.slack = p.ls - p.es;
    p.critical = p.slack <= 0 && (durOf(r) > 0 || ss.length > 0 || depsOf(r).length > 0);
    p.late = !isFinished(r) && now > p.ef && durOf(r) > 0;
    p.risk = !p.late && r.st !== 'run' && !isFinished(r) && now > p.es;
  }
  // the critical chain: from the last-finishing critical activity back through critical predecessors
  const byId = new Map(order.map((r) => [r.id!, r]));
  const path: string[] = [];
  let cur = [...out.values()].filter((p) => p.critical).sort((a, b) => b.ef - a.ef)[0];
  while (cur) {
    path.unshift(cur.id);
    const c = cur;
    cur = depsOf(byId.get(c.id)!)
      .map((d) => out.get(d)!)
      .filter((p) => p.critical && p.ef === c.es)
      .sort((a, b) => b.ef - a.ef)[0];
  }
  return { rows: out, start: t0, end, path };
}

/** "2h30", "45 min", "3 d 4h" (planned duration in minutes). */
export function fmtDur(min: number): string {
  if (!min) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  if (d) return `${d} d${h ? ` ${h}h` : ''}`;
  if (h) return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
  return `${m} min`;
}

/** Old runbooks wrote the phase as an "[Pré]" prefix of the activity. */
export function phaseOf(r: FnRow): string {
  if (r.phase) return r.phase;
  const m = /^\s*\[([^\]]{1,60})\]/.exec(r.act ?? '');
  return m ? m[1]!.trim() : '';
}
