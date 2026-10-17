import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  itemLinks,
  sapNoteSystems,
  sapNoteTransports,
  sapNotes,
  sapSystems,
  sapTransports,
} from '@/db/schema';
import type { SapNoteFieldsT } from '@/lib/sapNotes';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { checkProject } from './mg';
import { validateDoc, type PMNode } from './doc';
import { asUser, lockLimit, type Tx } from './tenant';

// Notas SAP: the tenant's library of SAP (OSS) notes, shared like the rest of
// the SAP data (D40). One note per number per tenant (unique index, the Trash
// included); the status of the note in each system of the landscape and the
// related transports in their own tables.

export type NoteSystem = { status: string; implOn: string | null; transportId: string | null };
export type SapNote = {
  id: string;
  number: number;
  version: number;
  title: string;
  component: string;
  category: string;
  priority: string;
  releasedOn: string | null;
  validity: Array<{ swc: string; rel: string; sp: string }>;
  impl: string[];
  prereqs: number[];
  projectId: string | null;
  tags: string[];
  transportIds: string[];
  /** status per system id (systems without a row are "not assessed") */
  systems: Record<string, NoteSystem>;
  createdAt: string;
  updatedAt: string;
};
export type SapNoteFull = SapNote & { body: PMNode | null };

const MAX = 10_000;
const cols = {
  id: sapNotes.id,
  number: sapNotes.number,
  version: sapNotes.version,
  title: sapNotes.title,
  component: sapNotes.component,
  category: sapNotes.category,
  priority: sapNotes.priority,
  releasedOn: sapNotes.releasedOn,
  validity: sapNotes.validity,
  impl: sapNotes.impl,
  prereqs: sapNotes.prereqs,
  projectId: sapNotes.projectId,
  tags: sapNotes.tags,
  createdAt: sapNotes.createdAt,
  updatedAt: sapNotes.updatedAt,
};
type Row = Omit<SapNote, 'validity' | 'transportIds' | 'systems' | 'createdAt' | 'updatedAt'> & {
  validity: unknown;
  createdAt: Date;
  updatedAt: Date;
};
const toNote = (r: Row, systems: Record<string, NoteSystem> = {}, transportIds: string[] = []): SapNote => ({
  ...r,
  validity: r.validity as SapNote['validity'],
  transportIds,
  systems,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Statuses and related transports of the given notes. */
async function relations(tx: Tx, ids: string[]) {
  const sys = new Map<string, Record<string, NoteSystem>>();
  const trs = new Map<string, string[]>();
  if (!ids.length) return { sys, trs };
  const ss = await tx
    .select({
      noteId: sapNoteSystems.noteId,
      systemId: sapNoteSystems.systemId,
      status: sapNoteSystems.status,
      implOn: sapNoteSystems.implOn,
      transportId: sapNoteSystems.transportId,
    })
    .from(sapNoteSystems)
    .innerJoin(sapSystems, eq(sapSystems.id, sapNoteSystems.systemId))
    .where(and(inArray(sapNoteSystems.noteId, ids), isNull(sapSystems.deletedAt)));
  for (const s of ss) {
    const m = sys.get(s.noteId) ?? {};
    m[s.systemId] = { status: s.status, implOn: s.implOn, transportId: s.transportId };
    sys.set(s.noteId, m);
  }
  const ts = await tx
    .select({ noteId: sapNoteTransports.noteId, transportId: sapNoteTransports.transportId })
    .from(sapNoteTransports)
    .innerJoin(sapTransports, eq(sapTransports.id, sapNoteTransports.transportId))
    .where(and(inArray(sapNoteTransports.noteId, ids), isNull(sapTransports.deletedAt)));
  for (const t of ts) trs.set(t.noteId, [...(trs.get(t.noteId) ?? []), t.transportId]);
  return { sys, trs };
}

export async function listSapNotes(auth: AuthContext): Promise<SapNote[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(sapNotes)
      .where(isNull(sapNotes.deletedAt))
      .orderBy(asc(sapNotes.number))
      .limit(MAX);
    // in chunks: the ids go into the statement as parameters
    const out: SapNote[] = [];
    for (let i = 0; i < rows.length; i += 1000) {
      const part = rows.slice(i, i + 1000);
      const { sys, trs } = await relations(
        tx,
        part.map((r) => r.id),
      );
      for (const r of part) out.push(toNote(r, sys.get(r.id), trs.get(r.id)));
    }
    return out;
  });
}

export async function getSapNote(auth: AuthContext, id: string): Promise<SapNoteFull> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select({ ...cols, body: sapNotes.body })
      .from(sapNotes)
      .where(and(eq(sapNotes.id, id), isNull(sapNotes.deletedAt)));
    if (!r) throw new ApiError(404, 'not_found');
    const { body, ...rest } = r;
    const { sys, trs } = await relations(tx, [id]);
    return { ...toNote(rest, sys.get(id), trs.get(id)), body: (body as PMNode | null) ?? null };
  });
}

/** A number already in the library (or in its Trash) → 409 with the existing note. */
async function assertFreeNumber(tx: Tx, n: number, except?: string) {
  const [r] = await tx
    .select({ id: sapNotes.id, deletedAt: sapNotes.deletedAt })
    .from(sapNotes)
    .where(eq(sapNotes.number, n));
  if (r && r.id !== except)
    throw new ApiError(409, r.deletedAt ? 'note_in_trash' : 'note_exists', undefined, { id: r.id });
}

async function checkTransports(tx: Tx, ids: string[]) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return uniq;
  const rs = await tx
    .select({ id: sapTransports.id })
    .from(sapTransports)
    .where(and(inArray(sapTransports.id, uniq), isNull(sapTransports.deletedAt)));
  if (rs.length !== uniq.length) throw new ApiError(404, 'transport_not_found');
  return uniq;
}

async function setTransports(tx: Tx, auth: AuthContext, noteId: string, ids: string[]) {
  await tx.delete(sapNoteTransports).where(eq(sapNoteTransports.noteId, noteId));
  if (ids.length)
    await tx
      .insert(sapNoteTransports)
      .values(ids.map((transportId) => ({ tenantId: auth.tenant.id, noteId, transportId })));
}

export type SapNotePatch = Partial<SapNoteFieldsT>;

/** The columns of a patch (`self`: the note's own number, never its own prerequisite). */
function columns(p: SapNotePatch, self: number) {
  const { transportIds: _t, body, prereqs, tags, ...rest } = p;
  const set: Record<string, unknown> = { ...rest };
  if (prereqs !== undefined) set.prereqs = [...new Set(prereqs)].filter((n) => n !== self);
  if (tags !== undefined) set.tags = [...new Set(tags)];
  if (body !== undefined) set.body = body === null ? null : validateDoc(body, { images: 'none' });
  return set;
}

export async function createSapNote(
  auth: AuthContext,
  input: SapNotePatch & { number: number },
): Promise<SapNote> {
  return asUser(auth, async (tx) => {
    await lockLimit(tx, auth.tenant.id, 'sap_notes');
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(sapNotes)) as [{ n: number }];
    if (n >= MAX) throw new ApiError(400, 'too_many_items');
    await assertFreeNumber(tx, input.number);
    const set = columns(input, input.number);
    if (input.projectId !== undefined) set.projectId = await checkProject(tx, input.projectId);
    const trs = await checkTransports(tx, input.transportIds ?? []);
    const [r] = await tx
      .insert(sapNotes)
      .values({ ...(set as object), number: input.number, tenantId: auth.tenant.id, createdBy: auth.user.id })
      .returning(cols);
    await setTransports(tx, auth, r!.id, trs);
    return toNote(r!, {}, trs);
  });
}

/** "Importar" a pasted list of numbers: new notes for the ones not in the library yet. */
export async function importSapNotes(auth: AuthContext, numbers: number[]) {
  return asUser(auth, async (tx) => {
    await lockLimit(tx, auth.tenant.id, 'sap_notes');
    const uniq = [...new Set(numbers)];
    const have = new Set(
      uniq.length
        ? (await tx.select({ n: sapNotes.number }).from(sapNotes).where(inArray(sapNotes.number, uniq))).map(
            (r) => r.n,
          )
        : [],
    );
    const fresh = uniq.filter((n) => !have.has(n));
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(sapNotes)) as [{ n: number }];
    if (n + fresh.length > MAX) throw new ApiError(400, 'too_many_items');
    const made = fresh.length
      ? await tx
          .insert(sapNotes)
          .values(fresh.map((number) => ({ number, tenantId: auth.tenant.id, createdBy: auth.user.id })))
          .returning(cols)
      : [];
    return { created: made.map((r) => toNote(r)), skipped: uniq.filter((x) => have.has(x)) };
  });
}

export async function updateSapNote(auth: AuthContext, id: string, patch: SapNotePatch): Promise<SapNote> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ id: sapNotes.id, number: sapNotes.number })
      .from(sapNotes)
      .where(and(eq(sapNotes.id, id), isNull(sapNotes.deletedAt)))
      .for('update');
    if (!cur) throw new ApiError(404, 'not_found');
    if (patch.number !== undefined && patch.number !== cur.number) {
      await lockLimit(tx, auth.tenant.id, 'sap_notes');
      await assertFreeNumber(tx, patch.number, id);
    }
    const set = columns(patch, patch.number ?? cur.number);
    if (patch.projectId !== undefined) set.projectId = await checkProject(tx, patch.projectId);
    if (patch.transportIds !== undefined)
      await setTransports(tx, auth, id, await checkTransports(tx, patch.transportIds));
    const [r] = await tx
      .update(sapNotes)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(sapNotes.id, id))
      .returning(cols);
    const { sys, trs } = await relations(tx, [id]);
    return toNote(r!, sys.get(id), trs.get(id));
  });
}

/** Status of a note in one system (with the implementation date and the transport used). */
export async function setNoteSystem(
  auth: AuthContext,
  noteId: string,
  systemId: string,
  input: { status: string; implOn?: string | null; transportId?: string | null },
): Promise<NoteSystem> {
  return asUser(auth, async (tx) => {
    const [n] = await tx
      .select({ id: sapNotes.id })
      .from(sapNotes)
      .where(and(eq(sapNotes.id, noteId), isNull(sapNotes.deletedAt)));
    if (!n) throw new ApiError(404, 'not_found');
    const [s] = await tx
      .select({ id: sapSystems.id })
      .from(sapSystems)
      .where(and(eq(sapSystems.id, systemId), isNull(sapSystems.deletedAt)));
    if (!s) throw new ApiError(404, 'system_not_found');
    if (input.transportId) await checkTransports(tx, [input.transportId]);
    const today = new Date().toISOString().slice(0, 10);
    const [cur] = await tx
      .select({ implOn: sapNoteSystems.implOn, transportId: sapNoteSystems.transportId })
      .from(sapNoteSystems)
      .where(and(eq(sapNoteSystems.noteId, noteId), eq(sapNoteSystems.systemId, systemId)));
    // "Implementada" without a date takes today's (kept when it had one)
    const implOn =
      input.implOn !== undefined
        ? input.implOn
        : input.status === 'done'
          ? (cur?.implOn ?? today)
          : (cur?.implOn ?? null);
    const transportId = input.transportId !== undefined ? input.transportId : (cur?.transportId ?? null);
    const values = {
      status: input.status,
      implOn,
      transportId,
      updatedBy: auth.user.id,
      updatedAt: new Date(),
    };
    await tx
      .insert(sapNoteSystems)
      .values({ tenantId: auth.tenant.id, noteId, systemId, ...values })
      .onConflictDoUpdate({ target: [sapNoteSystems.noteId, sapNoteSystems.systemId], set: values });
    await tx.update(sapNotes).set({ updatedAt: new Date() }).where(eq(sapNotes.id, noteId));
    return { status: input.status, implOn, transportId };
  });
}

export async function trashSapNote(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapNotes)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapNotes.id, id), isNull(sapNotes.deletedAt)))
      .returning({ id: sapNotes.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeSapNotesTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  await tx
    .delete(itemLinks)
    .where(
      sql`(${itemLinks.aType} = 'sapnote' and ${inArray(itemLinks.aId, ids)}) or (${itemLinks.bType} = 'sapnote' and ${inArray(itemLinks.bId, ids)})`,
    );
  // statuses and related transports go by cascade
  await tx.delete(sapNotes).where(inArray(sapNotes.id, ids));
}

/** Application components already used (autocomplete). */
export async function usedComponents(auth: AuthContext): Promise<string[]> {
  return asUser(auth, async (tx) =>
    (
      await tx
        .selectDistinct({ c: sapNotes.component })
        .from(sapNotes)
        .where(and(isNull(sapNotes.deletedAt), sql`${sapNotes.component} <> ''`))
        .orderBy(asc(sapNotes.component))
        .limit(500)
    ).map((r) => r.c),
  );
}
