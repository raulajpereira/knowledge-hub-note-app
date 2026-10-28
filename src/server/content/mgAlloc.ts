import 'server-only';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { mgAbsences, mgBookingDays, mgBookings, mgPeople, mgProjects } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import {
  AL_MAX_DAYS,
  AbsenceSchema,
  BookingSchema,
  dnOf,
  type AlOpT,
  type Absence,
  type Booking,
} from '@/lib/alloc';
import { asUser, type Tx } from './tenant';

// Alocações v2 (migration 0050): the manager's bookings, their typed days
// and the absences, read by date range and changed in batches. Each change
// carries the version (updated_at, milliseconds) it was made on: a booking
// someone else changed or removed in the meantime makes the whole batch fail
// with 409 `conflict` (nothing applied) and the screen reloads it.

export type AlRange = { from: string; to: string; bookings: Booking[]; absences: Absence[] };

const ver = (d: Date) => d.toISOString();
const iso = (d: string | Date) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

/** Bookings and absences overlapping [from, to] (each booking with all its typed days). */
export async function loadAlloc(auth: AuthContext, from: string, to: string): Promise<AlRange> {
  if (from > to || dnOf(to) - dnOf(from) > 4 * 366)
    throw new ApiError(400, 'invalid_input', 'range too long');
  return asUser(auth, async (tx) => {
    const [bk, ab] = await Promise.all([
      tx
        .select()
        .from(mgBookings)
        .where(and(gte(mgBookings.toDate, from), lte(mgBookings.fromDate, to)))
        .orderBy(mgBookings.fromDate, mgBookings.id),
      tx
        .select()
        .from(mgAbsences)
        .where(and(gte(mgAbsences.toDate, from), lte(mgAbsences.fromDate, to)))
        .orderBy(mgAbsences.fromDate, mgAbsences.id),
    ]);
    const days = new Map<string, Record<string, number>>();
    const ids = bk.map((b) => b.id);
    for (let i = 0; i < ids.length; i += 2000) {
      const rows = await tx
        .select()
        .from(mgBookingDays)
        .where(inArray(mgBookingDays.bookingId, ids.slice(i, i + 2000)));
      for (const r of rows) {
        const m = days.get(r.bookingId) ?? {};
        m[iso(r.day)] = r.hours;
        days.set(r.bookingId, m);
      }
    }
    return {
      from,
      to,
      bookings: bk.map((b) => toBooking(b, days.get(b.id) ?? {})),
      absences: ab.map(toAbsence),
    };
  });
}

function toBooking(b: typeof mgBookings.$inferSelect, days: Record<string, number>): Booking {
  return {
    id: b.id,
    person: b.personId ?? '',
    project: b.projectId,
    role: b.role,
    status: b.status,
    from: iso(b.fromDate),
    to: iso(b.toDate),
    mode: b.mode,
    value: b.value,
    mask: b.mask,
    hol: b.hol,
    note: b.note,
    need: (b.need as Booking['need']) ?? [],
    days,
    ver: ver(b.updatedAt),
  };
}
function toAbsence(a: typeof mgAbsences.$inferSelect): Absence {
  return {
    id: a.id,
    person: a.personId,
    type: a.type,
    from: iso(a.fromDate),
    to: iso(a.toDate),
    hours: a.hours,
    note: a.note,
    ver: ver(a.updatedAt),
  };
}

const conflict = (id: string) => new ApiError(409, 'conflict', `changed meanwhile: ${id}`);
// a new version, always later than the one it replaces (two saves in the same ms stay apart)
const bump = (col: typeof mgBookings.updatedAt | typeof mgAbsences.updatedAt) =>
  sql`greatest(date_trunc('milliseconds', clock_timestamp()), ${col} + interval '1 millisecond')`;

/** Applies a batch in the caller's transaction; returns the new version of each record written. */
export async function applyAlTx(tx: Tx, auth: AuthContext, ops: AlOpT[]): Promise<Record<string, string>> {
  const tenantId = auth.tenant.id;
  const ownerId = auth.user.id;
  const out: Record<string, string> = {};
  const people = new Set<string>();
  const projects = new Set<string>();
  for (const o of ops) {
    if (o.op === 'del') {
      const t = o.c === 'bk' ? mgBookings : mgAbsences;
      const gone = await tx
        .delete(t)
        .where(and(eq(t.id, o.id), sql`${t.updatedAt} = ${o.base}::timestamptz`))
        .returning({ id: t.id });
      if (!gone.length) {
        // already removed: fine; still there with another version: someone changed it
        const [still] = await tx.select({ id: t.id }).from(t).where(eq(t.id, o.id));
        if (still) throw conflict(o.id);
      }
      continue;
    }
    if (o.c === 'ab') {
      const p = AbsenceSchema.safeParse(o.v);
      if (!p.success) throw new ApiError(400, 'invalid_input', 'invalid absence');
      const a = p.data;
      people.add(a.person);
      const row = {
        personId: a.person,
        type: a.type,
        fromDate: a.from,
        toDate: a.to,
        hours: a.hours,
        note: a.note,
      };
      const r = o.base
        ? await tx
            .update(mgAbsences)
            .set({ ...row, updatedAt: bump(mgAbsences.updatedAt) })
            .where(and(eq(mgAbsences.id, a.id), sql`${mgAbsences.updatedAt} = ${o.base}::timestamptz`))
            .returning({ v: mgAbsences.updatedAt })
        : await tx
            .insert(mgAbsences)
            .values({ id: a.id, tenantId, ownerId, ...row })
            .onConflictDoNothing()
            .returning({ v: mgAbsences.updatedAt });
      if (!r[0]) throw conflict(a.id);
      out[a.id] = ver(r[0].v);
      continue;
    }
    const p = BookingSchema.safeParse(o.v);
    if (!p.success) throw new ApiError(400, 'invalid_input', 'invalid booking');
    const b = p.data;
    if (b.person) people.add(b.person);
    projects.add(b.project);
    const row = {
      personId: b.person || null,
      projectId: b.project,
      role: b.role,
      status: b.status,
      fromDate: b.from,
      toDate: b.to,
      mode: b.mode,
      value: b.value,
      mask: b.mask,
      hol: b.hol,
      note: b.note,
      need: b.need,
    };
    const r = o.base
      ? await tx
          .update(mgBookings)
          .set({ ...row, updatedAt: bump(mgBookings.updatedAt) })
          .where(and(eq(mgBookings.id, b.id), sql`${mgBookings.updatedAt} = ${o.base}::timestamptz`))
          .returning({ v: mgBookings.updatedAt })
      : await tx
          .insert(mgBookings)
          .values({ id: b.id, tenantId, ownerId, ...row })
          .onConflictDoNothing()
          .returning({ v: mgBookings.updatedAt });
    if (!r[0]) throw conflict(b.id);
    out[b.id] = ver(r[0].v);
    // the typed days: the full set, inside the range
    if (o.base) await tx.delete(mgBookingDays).where(eq(mgBookingDays.bookingId, b.id));
    const F = dnOf(b.from);
    const T = dnOf(b.to);
    const days = Object.entries(b.days)
      .filter(([d]) => dnOf(d) >= F && dnOf(d) <= T)
      .slice(0, AL_MAX_DAYS)
      .map(([day, hours]) => ({ bookingId: b.id, day, tenantId, ownerId, hours }));
    for (let i = 0; i < days.length; i += 1000)
      await tx.insert(mgBookingDays).values(days.slice(i, i + 1000));
  }
  // every person / project referred to must be the caller's (RLS hides the others)
  for (const [t, ids] of [
    [mgPeople, people],
    [mgProjects, projects],
  ] as const) {
    if (!ids.size) continue;
    const list = [...ids];
    const found = await tx.select({ id: t.id }).from(t).where(inArray(t.id, list));
    if (found.length !== list.length) throw new ApiError(400, 'invalid_reference', 'unknown reference');
  }
  return out;
}

export async function applyAlOps(auth: AuthContext, ops: AlOpT[]) {
  return asUser(auth, (tx) => applyAlTx(tx, auth, ops));
}
