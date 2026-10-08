import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { mgClients, sapSystemFavs, sapSystems, sapTcodeUsage, sapTcodes } from '@/db/schema';
import { TX_SEED, type SapEnv, type TxType } from '@/lib/sap';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';

// SAP landscape (ZNotes.dc.html isSystems / isTcodes). Systems, clients and the
// transaction library are shared by the tenant; favourites and usage are per user.

export type Client = { id: string; name: string };
export type SapSystem = {
  id: string;
  clientId: string | null;
  name: string;
  sid: string;
  env: SapEnv;
  type: string;
  host: string;
  inst: string;
  mandt: string;
  router: string;
  lang: string;
  sapUser: string;
  fiori: string;
  notes: string;
  fav: boolean;
  createdAt: string;
};
export type Tcode = {
  id: string;
  code: string;
  description: string;
  module: string;
  program: string;
  type: TxType;
  params: string;
  notes: string;
  fav: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string | null;
};

const MAX_ITEMS = 3000;

async function count(tx: Tx, table: typeof sapSystems | typeof sapTcodes | typeof mgClients) {
  const [{ n }] = (await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(isNull(table.deletedAt))) as [{ n: number }];
  return n;
}

// ── Clients ────────────────────────────────────────────────────────────────
export async function listClients(auth: AuthContext): Promise<Client[]> {
  return asUser(auth, (tx) =>
    tx
      .select({ id: mgClients.id, name: mgClients.name })
      .from(mgClients)
      .where(isNull(mgClients.deletedAt))
      .orderBy(asc(mgClients.name)),
  );
}

async function checkClient(tx: Tx, clientId: string | null | undefined) {
  if (!clientId) return null;
  const [c] = await tx
    .select({ id: mgClients.id })
    .from(mgClients)
    .where(and(eq(mgClients.id, clientId), isNull(mgClients.deletedAt)));
  if (!c) throw new ApiError(404, 'client_not_found');
  return c.id;
}

// ── Systems ────────────────────────────────────────────────────────────────
const sysCols = {
  id: sapSystems.id,
  clientId: sapSystems.clientId,
  name: sapSystems.name,
  sid: sapSystems.sid,
  env: sapSystems.env,
  type: sapSystems.type,
  host: sapSystems.host,
  inst: sapSystems.inst,
  mandt: sapSystems.mandt,
  router: sapSystems.router,
  lang: sapSystems.lang,
  sapUser: sapSystems.sapUser,
  fiori: sapSystems.fiori,
  notes: sapSystems.notes,
  createdAt: sapSystems.createdAt,
};
type SysRow = Omit<SapSystem, 'fav' | 'createdAt' | 'env'> & { env: string; createdAt: Date };
const toSystem = (r: SysRow, fav: boolean): SapSystem => ({
  ...r,
  env: r.env as SapEnv,
  fav,
  createdAt: r.createdAt.toISOString(),
});

async function favSet(tx: Tx, auth: AuthContext) {
  const rows = await tx
    .select({ id: sapSystemFavs.systemId })
    .from(sapSystemFavs)
    .where(eq(sapSystemFavs.userId, auth.user.id));
  return new Set(rows.map((r) => r.id));
}

export async function listSystems(auth: AuthContext): Promise<SapSystem[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(sysCols)
      .from(sapSystems)
      .where(isNull(sapSystems.deletedAt))
      .orderBy(asc(sapSystems.name))
      .limit(MAX_ITEMS);
    const favs = await favSet(tx, auth);
    return rows.map((r) => toSystem(r, favs.has(r.id)));
  });
}

export type SystemPatch = Partial<
  Pick<
    SapSystem,
    | 'clientId'
    | 'name'
    | 'sid'
    | 'env'
    | 'type'
    | 'host'
    | 'inst'
    | 'mandt'
    | 'router'
    | 'lang'
    | 'sapUser'
    | 'fiori'
    | 'notes'
  >
>;

export async function createSystem(
  auth: AuthContext,
  input: SystemPatch & { name: string },
): Promise<SapSystem> {
  return asUser(auth, async (tx) => {
    if ((await count(tx, sapSystems)) >= MAX_ITEMS) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(sapSystems)
      .values({
        ...input,
        sid: input.sid?.toUpperCase(),
        clientId: await checkClient(tx, input.clientId),
        tenantId: auth.tenant.id,
        createdBy: auth.user.id,
      })
      .returning(sysCols);
    return toSystem(r!, false);
  });
}

export async function updateSystem(auth: AuthContext, id: string, patch: SystemPatch): Promise<SapSystem> {
  return asUser(auth, async (tx) => {
    const p = { ...patch };
    if (p.clientId !== undefined) p.clientId = await checkClient(tx, p.clientId);
    if (p.sid !== undefined) p.sid = p.sid.toUpperCase();
    const [r] = await tx
      .update(sapSystems)
      .set({ ...p, updatedAt: new Date() })
      .where(and(eq(sapSystems.id, id), isNull(sapSystems.deletedAt)))
      .returning(sysCols);
    if (!r) throw new ApiError(404, 'not_found');
    return toSystem(r, (await favSet(tx, auth)).has(id));
  });
}

export async function setSystemFav(auth: AuthContext, id: string, fav: boolean) {
  await asUser(auth, async (tx) => {
    const [s] = await tx
      .select({ id: sapSystems.id })
      .from(sapSystems)
      .where(and(eq(sapSystems.id, id), isNull(sapSystems.deletedAt)));
    if (!s) throw new ApiError(404, 'not_found');
    if (fav)
      await tx
        .insert(sapSystemFavs)
        .values({ tenantId: auth.tenant.id, userId: auth.user.id, systemId: id })
        .onConflictDoNothing();
    else
      await tx
        .delete(sapSystemFavs)
        .where(and(eq(sapSystemFavs.userId, auth.user.id), eq(sapSystemFavs.systemId, id)));
  });
}

export async function trashSystem(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapSystems)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapSystems.id, id), isNull(sapSystems.deletedAt)))
      .returning({ id: sapSystems.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeSystemsTx(tx: Tx, ids: string[]) {
  if (ids.length) await tx.delete(sapSystems).where(inArray(sapSystems.id, ids));
}

// ── Transactions ───────────────────────────────────────────────────────────
const txCols = {
  id: sapTcodes.id,
  code: sapTcodes.code,
  description: sapTcodes.description,
  module: sapTcodes.module,
  program: sapTcodes.program,
  type: sapTcodes.type,
  params: sapTcodes.params,
  notes: sapTcodes.notes,
  createdAt: sapTcodes.createdAt,
  updatedAt: sapTcodes.updatedAt,
};
type TxRow = Omit<Tcode, 'fav' | 'uses' | 'createdAt' | 'updatedAt' | 'type'> & {
  type: string;
  createdAt: Date;
  updatedAt: Date | null;
};
const toTcode = (r: TxRow, u?: { fav: boolean; uses: number }): Tcode => ({
  ...r,
  type: r.type as TxType,
  fav: u?.fav ?? false,
  uses: u?.uses ?? 0,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt?.toISOString() ?? null,
});

/** The prototype's catalogue, given to a tenant the first time the library is opened. */
async function seedTcodes(tx: Tx, auth: AuthContext) {
  const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(sapTcodes)) as [{ n: number }];
  if (n > 0) return;
  // one tenant-wide seed even when two members open it at the same moment
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kh_tcodes:' + auth.tenant.id}))`);
  const [{ m }] = (await tx.select({ m: sql<number>`count(*)::int` }).from(sapTcodes)) as [{ m: number }];
  if (m > 0) return;
  const rows = await tx
    .insert(sapTcodes)
    .values(
      TX_SEED.map(([code, description, module, program, type]) => ({
        tenantId: auth.tenant.id,
        code,
        description,
        module,
        program,
        type,
      })),
    )
    .returning({ id: sapTcodes.id, code: sapTcodes.code });
  const favs = rows.filter((r) => ['SE38', 'SE16N', 'ST22', 'SE09'].includes(r.code));
  if (favs.length)
    await tx
      .insert(sapTcodeUsage)
      .values(
        favs.map((r) => ({ tenantId: auth.tenant.id, userId: auth.user.id, tcodeId: r.id, fav: true })),
      );
}

export async function listTcodes(auth: AuthContext): Promise<Tcode[]> {
  return asUser(auth, async (tx) => {
    await seedTcodes(tx, auth);
    const rows = await tx
      .select(txCols)
      .from(sapTcodes)
      .where(isNull(sapTcodes.deletedAt))
      .orderBy(asc(sapTcodes.code))
      .limit(MAX_ITEMS);
    const usage = await tx
      .select({ id: sapTcodeUsage.tcodeId, fav: sapTcodeUsage.fav, uses: sapTcodeUsage.uses })
      .from(sapTcodeUsage)
      .where(eq(sapTcodeUsage.userId, auth.user.id));
    const U = new Map(usage.map((u) => [u.id, u]));
    return rows.map((r) => toTcode(r, U.get(r.id)));
  });
}

export type TcodePatch = Partial<
  Pick<Tcode, 'code' | 'description' | 'module' | 'program' | 'type' | 'params' | 'notes'>
>;

export async function createTcode(auth: AuthContext, input: TcodePatch): Promise<Tcode> {
  return asUser(auth, async (tx) => {
    if ((await count(tx, sapTcodes)) >= MAX_ITEMS) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(sapTcodes)
      .values({
        ...input,
        code: input.code?.toUpperCase(),
        program: input.program?.toUpperCase(),
        tenantId: auth.tenant.id,
      })
      .returning(txCols);
    return toTcode(r!);
  });
}

export async function updateTcode(auth: AuthContext, id: string, patch: TcodePatch): Promise<Tcode> {
  return asUser(auth, async (tx) => {
    const p = { ...patch };
    if (p.code !== undefined) p.code = p.code.toUpperCase();
    if (p.program !== undefined) p.program = p.program.toUpperCase();
    const [r] = await tx
      .update(sapTcodes)
      .set({ ...p, updatedAt: new Date() })
      .where(and(eq(sapTcodes.id, id), isNull(sapTcodes.deletedAt)))
      .returning(txCols);
    if (!r) throw new ApiError(404, 'not_found');
    const [u] = await tx
      .select({ fav: sapTcodeUsage.fav, uses: sapTcodeUsage.uses })
      .from(sapTcodeUsage)
      .where(and(eq(sapTcodeUsage.userId, auth.user.id), eq(sapTcodeUsage.tcodeId, id)));
    return toTcode(r, u);
  });
}

/** Favourite on/off, or one more use (TCodes popup: most searched first). */
export async function touchTcode(auth: AuthContext, id: string, what: { fav?: boolean; use?: boolean }) {
  await asUser(auth, async (tx) => {
    const [t] = await tx
      .select({ id: sapTcodes.id })
      .from(sapTcodes)
      .where(and(eq(sapTcodes.id, id), isNull(sapTcodes.deletedAt)));
    if (!t) throw new ApiError(404, 'not_found');
    await tx
      .insert(sapTcodeUsage)
      .values({
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        tcodeId: id,
        fav: what.fav ?? false,
        uses: what.use ? 1 : 0,
        lastUsed: what.use ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [sapTcodeUsage.userId, sapTcodeUsage.tcodeId],
        set: {
          ...(what.fav !== undefined ? { fav: what.fav } : {}),
          ...(what.use ? { uses: sql`${sapTcodeUsage.uses} + 1`, lastUsed: new Date() } : {}),
        },
      });
  });
}

export async function trashTcode(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapTcodes)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapTcodes.id, id), isNull(sapTcodes.deletedAt)))
      .returning({ id: sapTcodes.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeTcodesTx(tx: Tx, ids: string[]) {
  if (ids.length) await tx.delete(sapTcodes).where(inArray(sapTcodes.id, ids));
}
