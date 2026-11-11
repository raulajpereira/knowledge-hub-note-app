import 'server-only';
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  issues,
  mgClients,
  mgPeople,
  mgProjects,
  mgTimesheets,
  tickets,
  timeEntries,
  users,
} from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';
import { roundUp15, tsSlot } from '@/lib/timelog';

// "Registo de Tempos" (registo de horas). One running entry per person: the
// header button starts it (ticket / client / project / description) and
// stops it. The duration kept is rounded up to 15 minutes. With "Incluir nas
// Folhas de Tempos" (on by default) and a project, the hours go to the
// person's Management timesheet of that week and day (Mon–Fri, still a draft);
// what was added is kept in ts_applied so an edit or a delete takes it back.

export type TimeEntry = {
  id: string;
  refKind: 'ticket' | 'issue' | null;
  refId: string | null;
  refLabel: string;
  clientId: string | null;
  clientLabel: string;
  projectId: string | null;
  projectLabel: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  inTimesheet: boolean;
  /** where the hours went: 'added' | 'no_project' | 'weekend' | 'no_person' | 'submitted' | 'off' | null */
  tsState: string | null;
};

const s = (n: number) => z.string().trim().max(n);
export const TimeFields = z.object({
  refKind: z.enum(['ticket', 'issue']).nullable().optional(),
  refId: z.uuid().nullable().optional(),
  refLabel: s(200).optional(),
  clientId: z.uuid().nullable().optional(),
  clientLabel: s(200).optional(),
  projectId: z.uuid().nullable().optional(),
  projectLabel: s(200).optional(),
  description: s(4000).optional(),
  inTimesheet: z.boolean().optional(),
});
export const TimeStart = TimeFields;
export const TimeStop = z.object({
  description: s(4000).optional(),
  inTimesheet: z.boolean().optional(),
  /** "Terminar e começar outra" */
  next: TimeFields.optional(),
});
export const TimeManual = TimeFields.extend({ startedAt: z.iso.datetime(), endedAt: z.iso.datetime() });
export const TimePatch = TimeFields.extend({
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
});

type Row = typeof timeEntries.$inferSelect;
const out = (r: Row): TimeEntry => ({
  id: r.id,
  refKind: r.refKind,
  refId: r.refId,
  refLabel: r.refLabel,
  clientId: r.clientId,
  clientLabel: r.clientLabel,
  projectId: r.projectId,
  projectLabel: r.projectLabel,
  description: r.description,
  startedAt: r.startedAt.toISOString(),
  endedAt: r.endedAt?.toISOString() ?? null,
  minutes: r.minutes,
  inTimesheet: r.inTimesheet,
  tsState: r.endedAt ? (((r.tsApplied as { state?: string } | null)?.state ?? null) as string | null) : null,
});

const mine = (auth: AuthContext) =>
  and(eq(timeEntries.tenantId, auth.tenant.id), eq(timeEntries.ownerId, auth.user.id));

/** A picked ticket / project task / client / project must exist (and be visible); labels follow them. */
async function resolve(tx: Tx, f: z.infer<typeof TimeFields>) {
  const v: Partial<Row> = {};
  if (f.refKind !== undefined || f.refId !== undefined || f.refLabel !== undefined) {
    if (f.refKind && f.refId) {
      if (f.refKind === 'ticket') {
        const [t] = await tx
          .select({ n: tickets.number, s: tickets.summary, c: tickets.clientId, cn: tickets.clientName })
          .from(tickets)
          .where(and(eq(tickets.id, f.refId), isNull(tickets.deletedAt)));
        if (!t) throw new ApiError(400, 'invalid_reference', 'unknown ticket');
        v.refLabel = `${t.n} · ${t.s}`.slice(0, 200);
        // the ticket's client unless one was chosen
        if (f.clientId === undefined && f.clientLabel === undefined && (t.c || t.cn)) {
          v.clientId = t.c;
          v.clientLabel = t.cn;
        }
      } else {
        const [i] = await tx
          .select({ t: issues.title, p: issues.projectId })
          .from(issues)
          .where(and(eq(issues.id, f.refId), isNull(issues.deletedAt)));
        if (!i) throw new ApiError(400, 'invalid_reference', 'unknown issue');
        v.refLabel = i.t.slice(0, 200);
        if (f.projectId === undefined && i.p) v.projectId = i.p;
      }
      v.refKind = f.refKind;
      v.refId = f.refId;
    } else {
      v.refKind = null;
      v.refId = null;
      v.refLabel = f.refLabel ?? '';
    }
  }
  if (f.clientId !== undefined || f.clientLabel !== undefined) {
    if (f.clientId) {
      const [c] = await tx.select({ n: mgClients.name }).from(mgClients).where(eq(mgClients.id, f.clientId));
      if (!c) throw new ApiError(400, 'invalid_reference', 'unknown client');
      v.clientId = f.clientId;
      v.clientLabel = c.n;
    } else {
      v.clientId = null;
      v.clientLabel = f.clientLabel ?? '';
    }
  }
  const pid = f.projectId !== undefined ? f.projectId : v.projectId;
  if (pid !== undefined || f.projectLabel !== undefined) {
    if (pid) {
      const [p] = await tx
        .select({ code: mgProjects.code, name: mgProjects.name, client: mgProjects.clientId })
        .from(mgProjects)
        .where(eq(mgProjects.id, pid));
      if (!p) throw new ApiError(400, 'invalid_reference', 'unknown project');
      v.projectId = pid;
      v.projectLabel = [p.code, p.name].filter(Boolean).join(' · ').slice(0, 200);
      // the project's client when no client was given
      if (!v.clientId && !f.clientId && !f.clientLabel && p.client) {
        const [c] = await tx.select({ n: mgClients.name }).from(mgClients).where(eq(mgClients.id, p.client));
        if (c) {
          v.clientId = p.client;
          v.clientLabel = c.n;
        }
      }
    } else {
      v.projectId = null;
      v.projectLabel = f.projectLabel ?? '';
    }
  }
  if (f.description !== undefined) v.description = f.description;
  if (f.inTimesheet !== undefined) v.inTimesheet = f.inTimesheet;
  return v;
}

/** The Management person of this account (same email), for the timesheet. */
async function personOf(tx: Tx, auth: AuthContext): Promise<string | null> {
  const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, auth.user.id));
  if (!u?.email) return null;
  const [p] = await tx
    .select({ id: mgPeople.id })
    .from(mgPeople)
    .where(sql`lower(${mgPeople.email}) = lower(${u.email})`)
    .limit(1);
  return p?.id ?? null;
}

type Applied = { state: string; tsId?: string; project?: string; day?: number; hours?: number };

/** Takes back what an entry had added to a timesheet (only while it is still a draft). */
async function unapply(tx: Tx, a: Applied | null) {
  if (!a || a.state !== 'added' || !a.tsId || !a.project || a.day === undefined || !a.hours) return;
  const [ts] = await tx
    .select({ rows: mgTimesheets.rows, status: mgTimesheets.status })
    .from(mgTimesheets)
    .where(eq(mgTimesheets.id, a.tsId));
  if (!ts || ts.status !== 'Rascunho') return;
  const rows = { ...(ts.rows as Record<string, number[]>) };
  const r = [...(rows[a.project] ?? [0, 0, 0, 0, 0])];
  r[a.day] = Math.max(0, Math.round(((+(r[a.day] ?? 0) || 0) - a.hours) * 100) / 100);
  rows[a.project] = r;
  await tx.update(mgTimesheets).set({ rows, updatedAt: new Date() }).where(eq(mgTimesheets.id, a.tsId));
}

/** Adds an ended entry's hours to the person's timesheet; returns what was done. */
async function apply(
  tx: Tx,
  auth: AuthContext,
  e: Row,
  mods: ReadonlySet<string>,
  tz: string,
): Promise<Applied> {
  if (!e.endedAt || !e.minutes) return { state: 'off' };
  if (!e.inTimesheet || !mods.has('mg_time')) return { state: 'off' };
  if (!e.projectId) return { state: 'no_project' };
  const slot = tsSlot(e.startedAt, tz);
  if (slot.day > 4) return { state: 'weekend' };
  const person = await personOf(tx, auth);
  if (!person) return { state: 'no_person' };
  const hours = e.minutes / 60;
  const [ts] = await tx
    .select({ id: mgTimesheets.id, rows: mgTimesheets.rows, status: mgTimesheets.status })
    .from(mgTimesheets)
    .where(and(eq(mgTimesheets.personId, person), eq(mgTimesheets.week, slot.week)));
  if (ts && ts.status !== 'Rascunho') return { state: 'submitted' };
  const rows = { ...((ts?.rows as Record<string, number[]> | undefined) ?? {}) };
  const r = [...(rows[e.projectId] ?? [0, 0, 0, 0, 0])];
  r[slot.day] = Math.round(((+(r[slot.day] ?? 0) || 0) + hours) * 100) / 100;
  rows[e.projectId] = r;
  let tsId = ts?.id;
  if (ts)
    await tx.update(mgTimesheets).set({ rows, updatedAt: new Date() }).where(eq(mgTimesheets.id, ts.id));
  else {
    tsId = crypto.randomUUID();
    await tx.insert(mgTimesheets).values({
      id: tsId,
      tenantId: auth.tenant.id,
      ownerId: auth.user.id,
      personId: person,
      week: slot.week,
      status: 'Rascunho',
      rows,
    });
  }
  return { state: 'added', tsId, project: e.projectId, day: slot.day, hours };
}

/** Re-does the timesheet part of an entry after a change. */
async function sync(tx: Tx, auth: AuthContext, e: Row, mods: ReadonlySet<string>, tz: string) {
  await unapply(tx, e.tsApplied as Applied | null);
  const a = await apply(tx, auth, e, mods, tz);
  const [r] = await tx.update(timeEntries).set({ tsApplied: a }).where(eq(timeEntries.id, e.id)).returning();
  return r!;
}

export async function runningEntry(auth: AuthContext): Promise<TimeEntry | null> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), isNull(timeEntries.endedAt), isNull(timeEntries.deletedAt)));
    return r ? out(r) : null;
  });
}

async function startIn(tx: Tx, auth: AuthContext, f: z.infer<typeof TimeFields>, at: Date) {
  const [busy] = await tx
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(mine(auth), isNull(timeEntries.endedAt), isNull(timeEntries.deletedAt)));
  if (busy) throw new ApiError(409, 'timer_running');
  const v = await resolve(tx, f);
  const [r] = await tx
    .insert(timeEntries)
    .values({ ...v, tenantId: auth.tenant.id, ownerId: auth.user.id, startedAt: at })
    .returning();
  return r!;
}

export async function startEntry(auth: AuthContext, f: z.infer<typeof TimeFields>): Promise<TimeEntry> {
  return asUser(auth, async (tx) => out(await startIn(tx, auth, f, new Date())));
}

export async function stopEntry(
  auth: AuthContext,
  input: z.infer<typeof TimeStop>,
  mods: ReadonlySet<string>,
  tz: string,
): Promise<{ stopped: TimeEntry; next: TimeEntry | null }> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), isNull(timeEntries.endedAt), isNull(timeEntries.deletedAt)))
      .for('update');
    if (!r) throw new ApiError(409, 'timer_not_running');
    const now = new Date();
    const [ended] = await tx
      .update(timeEntries)
      .set({
        endedAt: now,
        minutes: roundUp15((now.getTime() - r.startedAt.getTime()) / 1000),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.inTimesheet !== undefined ? { inTimesheet: input.inTimesheet } : {}),
        updatedAt: now,
      })
      .where(eq(timeEntries.id, r.id))
      .returning();
    const stopped = await sync(tx, auth, ended!, mods, tz);
    const next = input.next ? await startIn(tx, auth, input.next, now) : null;
    return { stopped: out(stopped), next: next ? out(next) : null };
  });
}

export async function addManual(
  auth: AuthContext,
  input: z.infer<typeof TimeManual>,
  mods: ReadonlySet<string>,
  tz: string,
): Promise<TimeEntry> {
  const from = new Date(input.startedAt);
  const to = new Date(input.endedAt);
  if (!(to > from)) throw new ApiError(400, 'invalid_range');
  return asUser(auth, async (tx) => {
    const v = await resolve(tx, input);
    const [r] = await tx
      .insert(timeEntries)
      .values({
        ...v,
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        startedAt: from,
        endedAt: to,
        minutes: roundUp15((to.getTime() - from.getTime()) / 1000),
      })
      .returning();
    return out(await sync(tx, auth, r!, mods, tz));
  });
}

export async function updateEntry(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof TimePatch>,
  mods: ReadonlySet<string>,
  tz: string,
): Promise<TimeEntry> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), eq(timeEntries.id, id), isNull(timeEntries.deletedAt)))
      .for('update');
    if (!r) throw new ApiError(404, 'not_found');
    const v = await resolve(tx, input);
    const from = input.startedAt ? new Date(input.startedAt) : r.startedAt;
    const to = input.endedAt ? (r.endedAt ? new Date(input.endedAt) : null) : r.endedAt;
    if (from > new Date()) throw new ApiError(400, 'invalid_range');
    if (to && !(to > from)) throw new ApiError(400, 'invalid_range');
    const [u] = await tx
      .update(timeEntries)
      .set({
        ...v,
        startedAt: from,
        endedAt: to,
        minutes: to ? roundUp15((to.getTime() - from.getTime()) / 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, id))
      .returning();
    return out(u!.endedAt ? await sync(tx, auth, u!, mods, tz) : u!);
  });
}

/** To the Trash: its hours leave the timesheet too (they come back on restore). */
export async function deleteEntry(auth: AuthContext, id: string): Promise<void> {
  await asUser(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), eq(timeEntries.id, id), isNull(timeEntries.deletedAt)))
      .for('update');
    if (!r) throw new ApiError(404, 'not_found');
    await unapply(tx, r.tsApplied as Applied | null);
    await tx
      .update(timeEntries)
      .set({ deletedAt: new Date(), tsApplied: null })
      .where(eq(timeEntries.id, id));
  });
}

/** Back from the Trash (a running one comes back stopped at the moment it was deleted). */
export async function restoreEntries(
  tx: Tx,
  auth: AuthContext,
  ids: string[],
  mods: ReadonlySet<string>,
  tz: string,
) {
  for (const id of ids) {
    const [r] = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), eq(timeEntries.id, id), isNotNull(timeEntries.deletedAt)));
    if (!r) continue;
    const end = r.endedAt ?? r.deletedAt!;
    const [u] = await tx
      .update(timeEntries)
      .set({
        deletedAt: null,
        endedAt: end,
        minutes: roundUp15((end.getTime() - r.startedAt.getTime()) / 1000),
      })
      .where(eq(timeEntries.id, id))
      .returning();
    await sync(tx, auth, u!, mods, tz);
  }
}

export async function listEntries(auth: AuthContext, from: Date, to: Date): Promise<TimeEntry[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(timeEntries)
      .where(
        and(
          mine(auth),
          isNull(timeEntries.deletedAt),
          gte(timeEntries.startedAt, from),
          lt(timeEntries.startedAt, to),
        ),
      )
      .orderBy(desc(timeEntries.startedAt))
      .limit(2000);
    return rows.map(out);
  });
}

/** "Enviar semana para a folha de tempos": every entry of the range goes in. */
export async function includeRange(
  auth: AuthContext,
  from: Date,
  to: Date,
  mods: ReadonlySet<string>,
  tz: string,
): Promise<number> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(timeEntries)
      .where(
        and(
          mine(auth),
          isNull(timeEntries.deletedAt),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, from),
          lt(timeEntries.startedAt, to),
        ),
      )
      .for('update');
    let n = 0;
    for (const r of rows) {
      const [u] = await tx
        .update(timeEntries)
        .set({ inTimesheet: true })
        .where(eq(timeEntries.id, r.id))
        .returning();
      const s2 = await sync(tx, auth, u!, mods, tz);
      if ((s2.tsApplied as Applied | null)?.state === 'added') n++;
    }
    return n;
  });
}

export type TimeRef = { kind: 'ticket' | 'issue'; id: string; label: string; sub: string };

/** The ticket field's suggestions: tickets (number / summary) and project tasks (title). */
export async function searchRefs(
  auth: AuthContext,
  q: string,
  mods: ReadonlySet<string>,
): Promise<TimeRef[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return asUser(auth, async (tx) => {
    const res: TimeRef[] = [];
    if (mods.has('tickets'))
      for (const t of await tx
        .select({ id: tickets.id, n: tickets.number, s: tickets.summary, c: tickets.clientName })
        .from(tickets)
        .where(
          and(
            isNull(tickets.deletedAt),
            q ? or(ilike(tickets.number, like), ilike(tickets.summary, like)) : undefined,
          ),
        )
        .orderBy(desc(tickets.updatedAt))
        .limit(6))
        res.push({ kind: 'ticket', id: t.id, label: `${t.n} · ${t.s}`, sub: t.c });
    if (mods.has('issues'))
      for (const i of await tx
        .select({ id: issues.id, t: issues.title })
        .from(issues)
        .where(and(isNull(issues.deletedAt), q ? ilike(issues.title, like) : undefined))
        .orderBy(desc(issues.updatedAt))
        .limit(6))
        res.push({ kind: 'issue', id: i.id, label: i.t, sub: '' });
    return res;
  });
}

/** Clients, projects, the last entries (to start again in one click) and whether a timesheet person exists. */
export async function timeOptions(auth: AuthContext, mods: ReadonlySet<string>) {
  return asUser(auth, async (tx) => {
    const clients = await tx
      .select({ id: mgClients.id, name: mgClients.name })
      .from(mgClients)
      .orderBy(asc(mgClients.name))
      .limit(500);
    const projects =
      mods.has('mg_projects') || mods.has('mg_time')
        ? await tx
            .select({
              id: mgProjects.id,
              code: mgProjects.code,
              name: mgProjects.name,
              clientId: mgProjects.clientId,
            })
            .from(mgProjects)
            .orderBy(asc(mgProjects.code))
            .limit(500)
        : [];
    const recentRows = await tx
      .select()
      .from(timeEntries)
      .where(and(mine(auth), isNull(timeEntries.deletedAt), isNotNull(timeEntries.endedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .limit(30);
    const seen = new Set<string>();
    const recent: TimeEntry[] = [];
    for (const r of recentRows) {
      const k = `${r.refKind}:${r.refId ?? r.refLabel}|${r.clientId ?? r.clientLabel}|${r.projectId ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      recent.push(out(r));
      if (recent.length >= 4) break;
    }
    const timesheet = mods.has('mg_time') && !!(await personOf(tx, auth));
    return { clients, projects, recent, timesheet };
  });
}
