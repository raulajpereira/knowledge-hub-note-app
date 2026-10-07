import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { itemLinks, sapObjects } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { CL_NEW_NAME, clNewNodes, type ClNode, type ClType } from '@/lib/codelib';
import { asUser, type Tx } from './tenant';

// Code Library SAP (ZNotes.dc.html isCodelib): ABAP objects shared by the
// tenant (D40). The node tree is validated by ClNodesSchema at the API edge.
// Concurrent edits are detected by updatedAt (`base`), as in the whiteboard.

export type SapObject = {
  id: string;
  type: ClType;
  name: string;
  description: string;
  tags: string[];
  nodes: ClNode[];
  createdAt: string;
  updatedAt: string;
};

const cols = {
  id: sapObjects.id,
  type: sapObjects.type,
  name: sapObjects.name,
  description: sapObjects.description,
  tags: sapObjects.tags,
  nodes: sapObjects.nodes,
  createdAt: sapObjects.createdAt,
  updatedAt: sapObjects.updatedAt,
};
type Row = Omit<SapObject, 'type' | 'nodes' | 'createdAt' | 'updatedAt'> & {
  type: string;
  nodes: unknown;
  createdAt: Date;
  updatedAt: Date;
};
const toObject = (r: Row): SapObject => ({
  ...r,
  type: r.type as ClType,
  nodes: r.nodes as ClNode[],
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
const MAX_OBJECTS = 5000;

/** ABAP names are upper case without spaces; snippets keep a free title. */
export const clName = (type: ClType, v: string) =>
  (type === 'SNIP' ? v.trim() : v.toUpperCase().replace(/\s/g, '_')).slice(0, 120);

export async function listObjects(auth: AuthContext): Promise<SapObject[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(sapObjects)
      .where(isNull(sapObjects.deletedAt))
      .orderBy(desc(sapObjects.createdAt))
      .limit(MAX_OBJECTS);
    return rows.map(toObject);
  });
}

async function count(tx: Tx) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(sapObjects)
    .where(isNull(sapObjects.deletedAt));
  return r?.n ?? 0;
}

export async function createObject(
  auth: AuthContext,
  input: { type: ClType; name?: string },
): Promise<SapObject> {
  return asUser(auth, async (tx) => {
    if ((await count(tx)) >= MAX_OBJECTS) throw new ApiError(400, 'too_many_items');
    const name = clName(
      input.type,
      input.name || (input.type === 'SNIP' ? 'Snippet' : CL_NEW_NAME[input.type]),
    );
    const [r] = await tx
      .insert(sapObjects)
      .values({
        tenantId: auth.tenant.id,
        createdBy: auth.user.id,
        type: input.type,
        name,
        nodes: clNewNodes(input.type, name),
      })
      .returning(cols);
    return toObject(r!);
  });
}

export type ObjectPatch = {
  name?: string;
  description?: string;
  tags?: string[];
  nodes?: ClNode[];
  /** updatedAt the client edited from; a different one means someone else saved meanwhile. */
  base?: string;
  force?: boolean;
};

export async function updateObject(auth: AuthContext, id: string, patch: ObjectPatch): Promise<SapObject> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ type: sapObjects.type, updatedAt: sapObjects.updatedAt })
      .from(sapObjects)
      .where(and(eq(sapObjects.id, id), isNull(sapObjects.deletedAt)))
      .for('update');
    if (!cur) throw new ApiError(404, 'not_found');
    if (patch.base && !patch.force && cur.updatedAt.toISOString() !== patch.base)
      throw new ApiError(409, 'conflict', undefined, { updatedAt: cur.updatedAt.toISOString() });
    const now = new Date(Math.max(Date.now(), cur.updatedAt.getTime() + 1));
    const [r] = await tx
      .update(sapObjects)
      .set({
        ...(patch.name !== undefined ? { name: clName(cur.type as ClType, patch.name) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags ? { tags: [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))] } : {}),
        ...(patch.nodes ? { nodes: patch.nodes } : {}),
        updatedAt: now,
      })
      .where(eq(sapObjects.id, id))
      .returning(cols);
    return toObject(r!);
  });
}

/** Prototype clDuplicate: ABAP objects get "_COPY", snippets " (2)". */
export async function duplicateObject(auth: AuthContext, id: string): Promise<SapObject> {
  return asUser(auth, async (tx) => {
    const [src] = await tx
      .select(cols)
      .from(sapObjects)
      .where(and(eq(sapObjects.id, id), isNull(sapObjects.deletedAt)));
    if (!src) throw new ApiError(404, 'not_found');
    if ((await count(tx)) >= MAX_OBJECTS) throw new ApiError(400, 'too_many_items');
    const name = src.type === 'SNIP' ? `${src.name} (2)`.slice(0, 120) : `${src.name}_COPY`.slice(0, 40);
    const [r] = await tx
      .insert(sapObjects)
      .values({
        tenantId: auth.tenant.id,
        createdBy: auth.user.id,
        type: src.type,
        name,
        description: src.description,
        tags: src.tags,
        nodes: src.nodes,
      })
      .returning(cols);
    return toObject(r!);
  });
}

export async function trashObject(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(sapObjects)
      .set({ deletedAt: new Date() })
      .where(and(eq(sapObjects.id, id), isNull(sapObjects.deletedAt)))
      .returning({ id: sapObjects.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeObjectsTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  // links are per user (RLS): this drops the purging user's; others' are hidden once the object is gone
  await tx
    .delete(itemLinks)
    .where(
      sql`(${itemLinks.aType} = 'code' and ${inArray(itemLinks.aId, ids)}) or (${itemLinks.bType} = 'code' and ${inArray(itemLinks.bId, ids)})`,
    );
  await tx.delete(sapObjects).where(inArray(sapObjects.id, ids));
}
