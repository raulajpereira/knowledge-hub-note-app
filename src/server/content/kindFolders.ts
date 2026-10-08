import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { folders } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';

// Flat folders of a page (as in Notes and Artifacts), private to their owner
// (RLS): Ficheiros, Registos Reuniões. Removing a folder keeps its items
// (they go to "no folder" through the ON DELETE SET NULL of their folder_id).

export type FolderKind = 'files' | 'meetings';
export type KindFolder = { id: string; name: string; color: string };

const COLORS = ['#7fb0ff', '#7fd0a7', '#f0c36d', '#d39bff', '#ff9f8a', '#7fd6e0'];
const cols = { id: folders.id, name: folders.name, color: folders.color };

export function listKindFolders(tx: Tx, kind: FolderKind): Promise<KindFolder[]> {
  return tx
    .select(cols)
    .from(folders)
    .where(and(eq(folders.kind, kind), isNull(folders.deletedAt)))
    .orderBy(asc(folders.sort), asc(folders.createdAt));
}

export async function createKindFolder(
  auth: AuthContext,
  kind: FolderKind,
  name: string,
): Promise<KindFolder> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.kind, kind))) as [{ n: number }];
    if (n >= 200) throw new ApiError(400, 'too_many_folders');
    const [f] = await tx
      .insert(folders)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind,
        name,
        color: COLORS[n % COLORS.length]!,
        sort: n,
      })
      .returning(cols);
    return f!;
  });
}

export async function renameKindFolder(auth: AuthContext, kind: FolderKind, id: string, name: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(folders)
      .set({ name })
      .where(and(eq(folders.id, id), eq(folders.kind, kind)))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function deleteKindFolder(auth: AuthContext, kind: FolderKind, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.kind, kind)))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** The folder an item may go in (one of the caller's own of that kind), or null. */
export async function checkKindFolder(tx: Tx, kind: FolderKind, id: string | null | undefined) {
  if (!id) return null;
  const [f] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.kind, kind), isNull(folders.deletedAt)));
  if (!f) throw new ApiError(404, 'folder_not_found');
  return f.id;
}
