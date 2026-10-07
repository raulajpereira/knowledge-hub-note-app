import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { snippets, type SnippetFile } from '@/db/schema';
import { langOf, type DevType } from '@/lib/devlib';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';

// Code Library (DevLibrary.dc.html): snippets with several files, a type,
// tags, favourite and related snippets (kept in both directions).

export type Snippet = {
  id: string;
  title: string;
  type: string;
  tags: string[];
  fav: boolean;
  description: string;
  files: SnippetFile[];
  related: string[];
  createdAt: string;
  updatedAt: string;
};

const cols = {
  id: snippets.id,
  title: snippets.title,
  type: snippets.type,
  tags: snippets.tags,
  fav: snippets.fav,
  description: snippets.description,
  files: snippets.files,
  related: snippets.related,
  createdAt: snippets.createdAt,
  updatedAt: snippets.updatedAt,
};
type Row = Omit<Snippet, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date };
const toSnippet = (r: Row): Snippet => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Prototype onOk: "Função debounce" + JavaScript → funcao-debounce.js (Dockerfile keeps its name). */
export function firstFileName(title: string, lang: string) {
  const L = langOf(lang);
  if (L.id === 'dockerfile') return 'Dockerfile';
  const base =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'snippet';
  return `${base}.${L.ext}`;
}

export async function listSnippets(auth: AuthContext): Promise<Snippet[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(snippets)
      .where(isNull(snippets.deletedAt))
      .orderBy(desc(snippets.updatedAt))
      .limit(3000);
    return rows.map(toSnippet);
  });
}

export async function createSnippet(
  auth: AuthContext,
  input: { title: string; type: DevType; lang: string },
): Promise<Snippet> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(snippets)
      .where(isNull(snippets.deletedAt))) as [{ n: number }];
    if (n >= 3000) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(snippets)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        title: input.title,
        type: input.type,
        files: [{ id: 'f1', name: firstFileName(input.title, input.lang), lang: input.lang, code: '' }],
      })
      .returning(cols);
    return toSnippet(r!);
  });
}

async function owned(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  const rows = await tx
    .select({ id: snippets.id })
    .from(snippets)
    .where(and(inArray(snippets.id, ids), isNull(snippets.deletedAt)));
  return rows.map((r) => r.id);
}

export async function updateSnippet(
  auth: AuthContext,
  id: string,
  patch: Partial<{
    title: string;
    type: DevType;
    tags: string[];
    fav: boolean;
    description: string;
    files: SnippetFile[];
    related: string[];
  }>,
): Promise<Snippet> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ related: snippets.related })
      .from(snippets)
      .where(and(eq(snippets.id, id), isNull(snippets.deletedAt)));
    if (!cur) throw new ApiError(404, 'not_found');
    let related = patch.related;
    if (related) {
      related = await owned(tx, [...new Set(related.filter((r) => r !== id))]);
      // keep the relation symmetric (prototype onAddRel adds both sides)
      const added = related.filter((r) => !cur.related.includes(r));
      const removed = cur.related.filter((r) => !related!.includes(r));
      if (added.length)
        await tx
          .update(snippets)
          .set({ related: sql`array_append(${snippets.related}, ${id}::uuid)` })
          .where(and(inArray(snippets.id, added), sql`not (${id}::uuid = any(${snippets.related}))`));
      if (removed.length)
        await tx
          .update(snippets)
          .set({ related: sql`array_remove(${snippets.related}, ${id}::uuid)` })
          .where(inArray(snippets.id, removed));
    }
    const [r] = await tx
      .update(snippets)
      .set({ ...patch, ...(related ? { related } : {}), updatedAt: new Date() })
      .where(eq(snippets.id, id))
      .returning(cols);
    return toSnippet(r!);
  });
}

export async function trashSnippet(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(snippets)
      .set({ deletedAt: new Date() })
      .where(and(eq(snippets.id, id), isNull(snippets.deletedAt)))
      .returning({ id: snippets.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Trash purge: the snippets go and so do the references to them. */
export async function purgeSnippetsTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  await tx.delete(snippets).where(inArray(snippets.id, ids));
  for (const id of ids)
    await tx
      .update(snippets)
      .set({ related: sql`array_remove(${snippets.related}, ${id}::uuid)` })
      .where(sql`${id}::uuid = any(${snippets.related})`);
}
