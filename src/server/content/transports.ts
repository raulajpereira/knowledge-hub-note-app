import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { mgClients, sapSystems, sapTransports } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';

// Ordens de Transporte (ZNotes.dc.html isTransports): shared by the tenant.
// Each step (released → QAS → PRD, or "junk") is the moment it was ticked.

export type Transport = {
  id: string;
  trkorr: string;
  description: string;
  clientId: string | null;
  projectId: string | null;
  systemId: string | null;
  type: 'W' | 'C';
  owner: string;
  notes: string;
  releasedAt: string | null;
  qasAt: string | null;
  prdAt: string | null;
  junkAt: string | null;
  createdAt: string;
};
export type Step = 'released' | 'qas' | 'prd' | 'junk';

const cols = {
  id: sapTransports.id,
  trkorr: sapTransports.trkorr,
  description: sapTransports.description,
  clientId: sapTransports.clientId,
  projectId: sapTransports.projectId,
  systemId: sapTransports.systemId,
  type: sapTransports.type,
  owner: sapTransports.owner,
  notes: sapTransports.notes,
  releasedAt: sapTransports.releasedAt,
  qasAt: sapTransports.qasAt,
  prdAt: sapTransports.prdAt,
  junkAt: sapTransports.junkAt,
  createdAt: sapTransports.createdAt,
};
type Row = Omit<Transport, 'type' | 'releasedAt' | 'qasAt' | 'prdAt' | 'junkAt' | 'createdAt'> & {
  type: string;
  releasedAt: Date | null;
  qasAt: Date | null;
  prdAt: Date | null;
  junkAt: Date | null;
  createdAt: Date;
};
const iso = (d: Date | null) => d?.toISOString() ?? null;
const toTransport = (r: Row): Transport => ({
  ...r,
  type: r.type as 'W' | 'C',
  releasedAt: iso(r.releasedAt),
  qasAt: iso(r.qasAt),
  prdAt: iso(r.prdAt),
  junkAt: iso(r.junkAt),
  createdAt: r.createdAt.toISOString(),
});
const STEP_COL = { released: 'releasedAt', qas: 'qasAt', prd: 'prdAt', junk: 'junkAt' } as const;

export async function listTransports(auth: AuthContext): Promise<Transport[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(sapTransports)
      .where(isNull(sapTransports.deletedAt))
      .orderBy(desc(sapTransports.createdAt))
      .limit(5000);
    return rows.map(toTransport);
  });
}

async function systemOf(tx: Tx, id: string | null | undefined) {
  if (!id) return null;
  const [s] = await tx
    .select({ id: sapSystems.id, sid: sapSystems.sid, clientId: sapSystems.clientId })
    .from(sapSystems)
    .where(and(eq(sapSystems.id, id), isNull(sapSystems.deletedAt)));
  if (!s) throw new ApiError(404, 'system_not_found');
  return s;
}
async function checkClient(tx: Tx, id: string | null | undefined) {
  if (!id) return null;
  const [c] = await tx
    .select({ id: mgClients.id })
    .from(mgClients)
    .where(and(eq(mgClients.id, id), isNull(mgClients.deletedAt)));
  if (!c) throw new ApiError(404, 'client_not_found');
  return c.id;
}

export type TransportPatch = Partial<
  Pick<Transport, 'trkorr' | 'description' | 'clientId' | 'systemId' | 'type' | 'owner' | 'notes'>
> & { steps?: Partial<Record<Step, boolean>> };

/** Prototype oNew: number prefilled from the DEV system (SID + "K9"), client from that system. */
export async function createTransport(auth: AuthContext, input: TransportPatch): Promise<Transport> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sapTransports)
      .where(isNull(sapTransports.deletedAt))) as [{ n: number }];
    if (n >= 5000) throw new ApiError(400, 'too_many_items');
    const sys = await systemOf(tx, input.systemId);
    const [r] = await tx
      .insert(sapTransports)
      .values({
        tenantId: auth.tenant.id,
        createdBy: auth.user.id,
        trkorr: (input.trkorr ?? (sys?.sid ? `${sys.sid}K9` : '')).toUpperCase(),
        description: input.description ?? '',
        systemId: sys?.id ?? null,
        clientId: (await checkClient(tx, input.clientId)) ?? sys?.clientId ?? null,
        type: input.type ?? 'W',
        owner: (input.owner ?? '').toUpperCase(),
      })
      .returning(cols);
    return toTransport(r!);
  });
}

export async function updateTransport(
  auth: AuthContext,
  id: string,
  patch: TransportPatch,
): Promise<Transport> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ clientId: sapTransports.clientId })
      .from(sapTransports)
      .where(and(eq(sapTransports.id, id), isNull(sapTransports.deletedAt)));
    if (!cur) throw new ApiError(404, 'not_found');
    const { steps, ...rest } = patch;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (rest.trkorr !== undefined) set.trkorr = rest.trkorr.toUpperCase();
    if (rest.owner !== undefined) set.owner = rest.owner.toUpperCase();
    if (rest.clientId !== undefined) set.clientId = await checkClient(tx, rest.clientId);
    if (rest.systemId !== undefined) {
      const sys = await systemOf(tx, rest.systemId);
      set.systemId = sys?.id ?? null;
      // prototype: picking a system fills the client when there is none yet
      if (sys?.clientId && !cur.clientId && rest.clientId === undefined) set.clientId = sys.clientId;
    }
    const now = new Date();
    for (const [k, on] of Object.entries(steps ?? {}) as Array<[Step, boolean]>)
      set[STEP_COL[k]] = on ? now : null;
    const [r] = await tx.update(sapTransports).set(set).where(eq(sapTransports.id, id)).returning(cols);
    return toTransport(r!);
  });
}

export async function trashTransport(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapTransports)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapTransports.id, id), isNull(sapTransports.deletedAt)))
      .returning({ id: sapTransports.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeTransportsTx(tx: Tx, ids: string[]) {
  if (ids.length) await tx.delete(sapTransports).where(inArray(sapTransports.id, ids));
}
