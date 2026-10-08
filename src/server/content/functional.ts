import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { mgClients, sapFnRecords } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { FN, fnSchemas, type FnPage, type FnRow, type FnVal } from '@/lib/functional';
import { asUser, type Tx } from './tenant';

// Funcional SAP (SapFunctional.dc.html): records shared by the tenant (D40),
// one list per page. The fields and rows are checked against the page's
// schema (src/lib/functional.ts); conflicts are detected by updatedAt.

export type FnRecord = {
  id: string;
  page: FnPage;
  title: string;
  code: string;
  st: string;
  f: Record<string, FnVal>;
  rows: FnRow[];
  createdAt: string;
  updatedAt: string;
};

const cols = {
  id: sapFnRecords.id,
  page: sapFnRecords.page,
  title: sapFnRecords.title,
  code: sapFnRecords.code,
  st: sapFnRecords.st,
  f: sapFnRecords.f,
  rows: sapFnRecords.rows,
  createdAt: sapFnRecords.createdAt,
  updatedAt: sapFnRecords.updatedAt,
};
type Row = Omit<FnRecord, 'page' | 'f' | 'rows' | 'createdAt' | 'updatedAt'> & {
  page: string;
  f: unknown;
  rows: unknown;
  createdAt: Date;
  updatedAt: Date;
};
const toRecord = (r: Row): FnRecord => ({
  ...r,
  page: r.page as FnPage,
  f: r.f as Record<string, FnVal>,
  rows: r.rows as FnRow[],
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
const MAX = 5000;

export async function listRecords(auth: AuthContext, page: FnPage): Promise<FnRecord[]> {
  return asUser(auth, async (tx) =>
    (
      await tx
        .select(cols)
        .from(sapFnRecords)
        .where(and(eq(sapFnRecords.page, page), isNull(sapFnRecords.deletedAt)))
        .orderBy(desc(sapFnRecords.createdAt))
        .limit(MAX)
    ).map(toRecord),
  );
}

/** The client field must name a client of the tenant (projects and people: Management, Phase 8). */
async function checkRefs(tx: Tx, f: Record<string, FnVal>) {
  const c = f.client;
  if (typeof c === 'string' && c) {
    const [r] = await tx
      .select({ id: mgClients.id })
      .from(mgClients)
      .where(and(eq(mgClients.id, c), isNull(mgClients.deletedAt)));
    if (!r) throw new ApiError(404, 'client_not_found');
  }
}
function parse(page: FnPage, p: { st?: string; f?: unknown; rows?: unknown }) {
  const S = fnSchemas(page);
  const bad = (what: string) => new ApiError(400, 'invalid_input', `invalid ${what}`);
  const st = p.st === undefined ? undefined : S.st.safeParse(p.st);
  const f = p.f === undefined ? undefined : S.f.safeParse(p.f);
  const rows = p.rows === undefined ? undefined : S.rows.safeParse(p.rows);
  if (st && !st.success) throw bad('status');
  if (f && !f.success) throw bad('fields');
  if (rows && !rows.success) throw bad('rows');
  return {
    st: st?.data as string | undefined,
    f: f?.data as Record<string, FnVal> | undefined,
    rows: rows?.data as FnRow[] | undefined,
  };
}

export async function createRecord(
  auth: AuthContext,
  page: FnPage,
  input: { title: string; f?: unknown; code?: string; rows?: unknown },
): Promise<FnRecord> {
  const { f, rows } = parse(page, { f: input.f ?? {}, rows: input.rows ?? [] });
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sapFnRecords)
      .where(isNull(sapFnRecords.deletedAt))) as [{ n: number }];
    if (n >= MAX) throw new ApiError(400, 'too_many_items');
    await checkRefs(tx, f ?? {});
    const [r] = await tx
      .insert(sapFnRecords)
      .values({
        tenantId: auth.tenant.id,
        createdBy: auth.user.id,
        page,
        title: input.title,
        code: input.code ?? '',
        st: FN[page].st[0]![0],
        f: f ?? {},
        rows: rows ?? [],
      })
      .returning(cols);
    return toRecord(r!);
  });
}

export type FnPatch = {
  title?: string;
  code?: string;
  st?: string;
  f?: unknown;
  rows?: unknown;
  base?: string;
  force?: boolean;
};

export async function updateRecord(
  auth: AuthContext,
  page: FnPage,
  id: string,
  patch: FnPatch,
): Promise<FnRecord> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ page: sapFnRecords.page, updatedAt: sapFnRecords.updatedAt })
      .from(sapFnRecords)
      .where(and(eq(sapFnRecords.id, id), eq(sapFnRecords.page, page), isNull(sapFnRecords.deletedAt)))
      .for('update');
    if (!cur) throw new ApiError(404, 'not_found');
    if (patch.base && !patch.force && cur.updatedAt.toISOString() !== patch.base)
      throw new ApiError(409, 'conflict', undefined, { updatedAt: cur.updatedAt.toISOString() });
    const v = parse(cur.page as FnPage, patch);
    if (v.f) await checkRefs(tx, v.f);
    const [r] = await tx
      .update(sapFnRecords)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(v.st !== undefined ? { st: v.st } : {}),
        ...(v.f ? { f: v.f } : {}),
        ...(v.rows ? { rows: v.rows } : {}),
        updatedAt: new Date(Math.max(Date.now(), cur.updatedAt.getTime() + 1)),
      })
      .where(eq(sapFnRecords.id, id))
      .returning(cols);
    return toRecord(r!);
  });
}

export async function trashRecord(auth: AuthContext, page: FnPage, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapFnRecords)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapFnRecords.id, id), eq(sapFnRecords.page, page), isNull(sapFnRecords.deletedAt)))
      .returning({ id: sapFnRecords.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeRecordsTx(tx: Tx, ids: string[]) {
  if (ids.length) await tx.delete(sapFnRecords).where(inArray(sapFnRecords.id, ids));
}

/** Sidebar counts per page (prototype navCounts). */
export async function countRecords(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const rs = await tx
      .select({ page: sapFnRecords.page, n: sql<number>`count(*)::int` })
      .from(sapFnRecords)
      .where(isNull(sapFnRecords.deletedAt))
      .groupBy(sapFnRecords.page);
    return Object.fromEntries(rs.map((r) => [r.page, r.n])) as Partial<Record<FnPage, number>>;
  });
}
