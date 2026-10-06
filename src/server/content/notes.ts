import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { folders, itemLinks, noteAttachments, notes } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { assertWithinLimit } from '@/server/licensing/entitlements';
import { sniffImage } from '@/server/assets';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';
import { safeFetchBytes } from '@/server/net/safeFetch';
import { docChecklist, docFileIds, docText, FILE_SRC, validateDoc, type PMNode } from './doc';

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

// Notes & notebooks (prototype isNotes). Every query runs through asUser(),
// so Row Level Security limits it to the caller's own rows.

export const FOLDER_COLORS = [
  'oklch(0.78 0.11 60)',
  'oklch(0.78 0.11 150)',
  'oklch(0.78 0.11 275)',
  'oklch(0.78 0.11 330)',
  'oklch(0.78 0.11 200)',
  'oklch(0.8 0.11 100)',
];
export const TRASH_DAYS = 30;

const summaryOf = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

export type NoteListItem = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  folderId: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

const listCols = {
  id: notes.id,
  title: notes.title,
  contentText: notes.contentText,
  tags: notes.tags,
  folderId: notes.folderId,
  favorite: notes.favorite,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};
type ListRow = {
  [K in keyof typeof listCols]: (typeof notes.$inferSelect)[K extends 'contentText' ? 'contentText' : K];
};
const toItem = (r: ListRow): NoteListItem => ({
  id: r.id,
  title: r.title,
  summary: summaryOf(r.contentText),
  tags: r.tags,
  folderId: r.folderId,
  favorite: r.favorite,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

// ── Folders ────────────────────────────────────────────────────────────────
export async function listFolders(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select({ id: folders.id, name: folders.name, color: folders.color, sort: folders.sort })
      .from(folders)
      .where(and(eq(folders.kind, 'notes'), isNull(folders.deletedAt)))
      .orderBy(asc(folders.sort), asc(folders.createdAt));
    const counts = await tx
      .select({
        folderId: notes.folderId,
        n: sql<number>`count(*)::int`,
        fav: sql<number>`count(*) filter (where ${notes.favorite})::int`,
      })
      .from(notes)
      .where(isNull(notes.deletedAt))
      .groupBy(notes.folderId);
    const by = new Map(counts.map((c) => [c.folderId, c.n]));
    return {
      folders: rows.map((f) => ({ ...f, count: by.get(f.id) ?? 0 })),
      total: counts.reduce((a, c) => a + c.n, 0),
      favorites: counts.reduce((a, c) => a + c.fav, 0),
    };
  });
}

export async function createFolder(auth: AuthContext, name: string) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.kind, 'notes'))) as [{ n: number }];
    const [f] = await tx
      .insert(folders)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: 'notes',
        name,
        color: FOLDER_COLORS[n % FOLDER_COLORS.length]!,
        sort: n,
      })
      .returning({ id: folders.id, name: folders.name, color: folders.color });
    return f!;
  });
}

export async function renameFolder(auth: AuthContext, id: string, name: string) {
  await asUser(auth, async (tx) => {
    const r = await tx.update(folders).set({ name }).where(eq(folders.id, id)).returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Deleting a notebook sends it and its notes to the Trash (restorable for 30 days). */
export async function trashFolder(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const now = new Date();
    const r = await tx
      .update(folders)
      .set({ deletedAt: now })
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    await tx
      .update(notes)
      .set({ deletedAt: now })
      .where(and(eq(notes.folderId, id), isNull(notes.deletedAt)));
  });
}

export async function duplicateFolder(auth: AuthContext, id: string, copySuffix: string) {
  return asUser(auth, async (tx) => {
    const [src] = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)));
    if (!src) throw new ApiError(404, 'not_found');
    const srcNotes = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.folderId, id), isNull(notes.deletedAt)));
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .where(isNull(notes.deletedAt))) as [{ n: number }];
    await assertWithinLimit(auth.tenant.id, 'notes', n + srcNotes.length - 1);
    const [f] = await tx
      .insert(folders)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: 'notes',
        name: `${src.name}${copySuffix}`.slice(0, 80),
        color: src.color,
        sort: src.sort + 1,
      })
      .returning({ id: folders.id });
    for (const x of srcNotes) {
      const [copy] = await tx
        .insert(notes)
        .values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          folderId: f!.id,
          title: x.title,
          content: x.content,
          contentText: x.contentText,
          tags: x.tags,
          favorite: x.favorite,
          meta: x.meta,
        })
        .returning({ id: notes.id });
      const content = await cloneImages(tx, auth, x.id, copy!.id, x.content);
      if (content !== x.content) await tx.update(notes).set({ content }).where(eq(notes.id, copy!.id));
    }
    return f!;
  });
}

/** Drizzle wraps the driver error; the kh_note_folder_owner trigger raises 23503 for a foreign notebook. */
function folderError(e: { code?: string; cause?: { code?: string } }): never {
  if ((e.code ?? e.cause?.code) === '23503') throw new ApiError(400, 'folder_not_found');
  throw e;
}

// ── Notes ──────────────────────────────────────────────────────────────────
export async function listNotes(auth: AuthContext, q: { folder?: string; fav?: boolean; search?: string }) {
  return asUser(auth, async (tx) => {
    const conds = [isNull(notes.deletedAt)];
    if (q.folder) conds.push(eq(notes.folderId, q.folder));
    if (q.fav) conds.push(eq(notes.favorite, true));
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(
        or(
          ilike(notes.title, like),
          ilike(notes.contentText, like),
          sql`array_to_string(${notes.tags}, ' ') ilike ${like}`,
        )!,
      );
    }
    const rows = await tx
      .select(listCols)
      .from(notes)
      .where(and(...conds))
      .orderBy(desc(notes.updatedAt))
      .limit(500);
    return rows.map((r) => toItem(r as ListRow));
  });
}

export async function getNote(auth: AuthContext, id: string) {
  return asUser(auth, async (tx) => {
    const [n] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)));
    if (!n) throw new ApiError(404, 'not_found');
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      tags: n.tags,
      folderId: n.folderId,
      favorite: n.favorite,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  });
}

export async function createNote(auth: AuthContext, input: { folderId?: string | null; title?: string }) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .where(isNull(notes.deletedAt))) as [{ n: number }];
    await assertWithinLimit(auth.tenant.id, 'notes', n);
    const [row] = await tx
      .insert(notes)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId: input.folderId ?? null,
        title: input.title ?? '',
      })
      .returning(listCols)
      .catch(folderError);
    return toItem(row as ListRow);
  });
}

export async function updateNote(
  auth: AuthContext,
  id: string,
  input: { title?: string; content?: unknown; tags?: string[]; favorite?: boolean; folderId?: string | null },
) {
  const set: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
  let fileIds: string[] | null = null;
  if (input.title !== undefined) set.title = input.title;
  if (input.tags !== undefined)
    set.tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 30);
  if (input.favorite !== undefined) set.favorite = input.favorite;
  if (input.folderId !== undefined) set.folderId = input.folderId;
  if (input.content !== undefined) {
    const d = validateDoc(input.content);
    set.content = d;
    set.contentText = docText(d).slice(0, 200_000);
    fileIds = docFileIds(d);
  }
  // Favourite toggles and moves don't count as edits for "Atualizada".
  if (input.title === undefined && input.content === undefined && input.tags === undefined)
    delete set.updatedAt;
  return asUser(auth, async (tx) => {
    const r = await tx
      .update(notes)
      .set(set)
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
      .returning(listCols)
      .catch(folderError);
    if (!r.length) throw new ApiError(404, 'not_found');
    // Images removed from the note are deleted from storage (only those of this note).
    if (fileIds) {
      const gone = await tx
        .delete(noteAttachments)
        .where(
          and(
            eq(noteAttachments.noteId, id),
            fileIds.length ? notInArray(noteAttachments.id, fileIds) : sql`true`,
          ),
        )
        .returning({ key: noteAttachments.storageKey });
      for (const g of gone)
        await s3()
          .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: g.key }))
          .catch(() => {});
    }
    return toItem(r[0] as ListRow);
  });
}

export async function duplicateNote(auth: AuthContext, id: string, copySuffix: string) {
  return asUser(auth, async (tx) => {
    const [src] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)));
    if (!src) throw new ApiError(404, 'not_found');
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .where(isNull(notes.deletedAt))) as [{ n: number }];
    await assertWithinLimit(auth.tenant.id, 'notes', n);
    const [row] = await tx
      .insert(notes)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId: src.folderId,
        title: `${src.title}${copySuffix}`.slice(0, 300),
        content: src.content,
        contentText: src.contentText,
        tags: src.tags,
        meta: src.meta,
      })
      .returning(listCols);
    const content = await cloneImages(tx, auth, src.id, row!.id, src.content);
    if (content !== src.content) await tx.update(notes).set({ content }).where(eq(notes.id, row!.id));
    return toItem(row as ListRow);
  });
}

export async function trashNote(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
      .returning({ id: notes.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

// ── Trash (prototype isTrash) ──────────────────────────────────────────────
export type TrashItem = {
  id: string;
  kind: 'note' | 'folder';
  title: string;
  deletedAt: string;
  daysLeft: number;
};

export async function listTrash(auth: AuthContext): Promise<TrashItem[]> {
  return asUser(auth, async (tx) => {
    const ns = await tx
      .select({ id: notes.id, title: notes.title, deletedAt: notes.deletedAt, folderId: notes.folderId })
      .from(notes)
      .where(isNotNull(notes.deletedAt));
    const fs = await tx
      .select({ id: folders.id, title: folders.name, deletedAt: folders.deletedAt })
      .from(folders)
      .where(and(eq(folders.kind, 'notes'), isNotNull(folders.deletedAt)));
    const left = (d: Date) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - d.getTime()) / 86_400_000));
    return [
      ...fs.map((f) => ({
        id: f.id,
        kind: 'folder' as const,
        title: f.title,
        deletedAt: f.deletedAt!.toISOString(),
        daysLeft: left(f.deletedAt!),
      })),
      ...ns.map((n) => ({
        id: n.id,
        kind: 'note' as const,
        title: n.title,
        deletedAt: n.deletedAt!.toISOString(),
        daysLeft: left(n.deletedAt!),
      })),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  });
}

export async function restoreTrash(auth: AuthContext, items: Array<{ kind: 'note' | 'folder'; id: string }>) {
  await asUser(auth, async (tx) => {
    const fIds = items.filter((i) => i.kind === 'folder').map((i) => i.id);
    const nIds = items.filter((i) => i.kind === 'note').map((i) => i.id);
    if (fIds.length) {
      const fs = await tx
        .update(folders)
        .set({ deletedAt: null })
        .where(inArray(folders.id, fIds))
        .returning({ id: folders.id, deletedAt: folders.deletedAt });
      // notes deleted together with their notebook come back with it
      if (fs.length)
        await tx
          .update(notes)
          .set({ deletedAt: null })
          .where(and(inArray(notes.folderId, fIds), isNotNull(notes.deletedAt)));
    }
    if (nIds.length) {
      // a note whose notebook is still in the Trash comes back without a notebook
      await tx
        .update(notes)
        .set({
          deletedAt: null,
          folderId: sql`case when exists (select 1 from folders f where f.id = ${notes.folderId} and f.deleted_at is null) then ${notes.folderId} else null end`,
        })
        .where(inArray(notes.id, nIds));
    }
  });
}

async function purgeNotesTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  const files = await tx
    .delete(noteAttachments)
    .where(inArray(noteAttachments.noteId, ids))
    .returning({ key: noteAttachments.storageKey });
  await tx
    .delete(itemLinks)
    .where(
      or(
        and(eq(itemLinks.aType, 'note'), inArray(itemLinks.aId, ids)),
        and(eq(itemLinks.bType, 'note'), inArray(itemLinks.bId, ids)),
      ),
    );
  await tx.delete(notes).where(inArray(notes.id, ids));
  for (const f of files)
    await s3()
      .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: f.key }))
      .catch(() => {});
}

export async function purgeTrash(
  auth: AuthContext,
  items: Array<{ kind: 'note' | 'folder'; id: string }> | 'all',
) {
  await asUser(auth, async (tx) => {
    let nIds: string[];
    let fIds: string[];
    if (items === 'all') {
      nIds = (await tx.select({ id: notes.id }).from(notes).where(isNotNull(notes.deletedAt))).map(
        (r) => r.id,
      );
      fIds = (
        await tx
          .select({ id: folders.id })
          .from(folders)
          .where(and(eq(folders.kind, 'notes'), isNotNull(folders.deletedAt)))
      ).map((r) => r.id);
    } else {
      fIds = items.filter((i) => i.kind === 'folder').map((i) => i.id);
      nIds = items.filter((i) => i.kind === 'note').map((i) => i.id);
      if (fIds.length)
        nIds.push(
          ...(
            await tx
              .select({ id: notes.id })
              .from(notes)
              .where(and(inArray(notes.folderId, fIds), isNotNull(notes.deletedAt)))
          ).map((r) => r.id),
        );
    }
    await purgeNotesTx(tx, [...new Set(nIds)]);
    if (fIds.length)
      await tx.delete(folders).where(and(inArray(folders.id, fIds), isNotNull(folders.deletedAt)));
  });
  await audit({ action: 'trash.purged', actorUserId: auth.user.id, tenantId: auth.tenant.id });
}

// ── Images in notes ────────────────────────────────────────────────────────
const MAX_IMAGE = 5 * 1024 * 1024;

export async function addNoteImage(auth: AuthContext, noteId: string, data: Uint8Array): Promise<string> {
  if (data.length > MAX_IMAGE) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_IMAGE });
  const gif = data.length >= 6 && String.fromCharCode(...data.subarray(0, 4)) === 'GIF8';
  const mime = sniffImage(data) ?? (gif ? 'image/gif' : null);
  if (!mime) throw new ApiError(415, 'unsupported_image');
  return asUser(auth, async (tx) => {
    const [n] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    if (!n) throw new ApiError(404, 'not_found');
    const key = `tenants/${auth.tenant.id}/notes/${noteId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: mime }),
    );
    const [a] = await tx
      .insert(noteAttachments)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        noteId,
        storageKey: key,
        mime,
        size: data.length,
      })
      .returning({ id: noteAttachments.id });
    return a!.id;
  });
}

/** "Imagem a partir de link" and images in pasted HTML: fetched by the server (SSRF-guarded) and stored with the note. */
export async function importNoteImage(auth: AuthContext, noteId: string, url: string): Promise<string> {
  let data: Uint8Array;
  try {
    data = new Uint8Array((await safeFetchBytes(url, { maxBytes: MAX_IMAGE, timeoutMs: 8000 })).body);
  } catch {
    throw new ApiError(422, 'image_fetch_failed');
  }
  return addNoteImage(auth, noteId, data);
}

/**
 * Copies the images of a note to another one (duplicate note / notebook) and
 * rewrites the document to point at the copies, so each note owns its files.
 */
async function cloneImages(
  tx: Tx,
  auth: AuthContext,
  srcNoteId: string,
  dstNoteId: string,
  content: unknown,
) {
  const files = await tx.select().from(noteAttachments).where(eq(noteAttachments.noteId, srcNoteId));
  if (!files.length) return content;
  const map = new Map<string, string>();
  for (const f of files) {
    const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: f.storageKey }));
    const body = await obj.Body?.transformToByteArray();
    if (!body) continue;
    const key = `tenants/${auth.tenant.id}/notes/${dstNoteId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: f.mime }),
    );
    const [a] = await tx
      .insert(noteAttachments)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        noteId: dstNoteId,
        storageKey: key,
        mime: f.mime,
        size: f.size,
      })
      .returning({ id: noteAttachments.id });
    map.set(f.id, a!.id);
  }
  const walk = (n: PMNode): PMNode => {
    const m = n.type === 'image' && typeof n.attrs?.src === 'string' ? FILE_SRC.exec(n.attrs.src) : null;
    const id = m ? map.get(m[1]!) : undefined;
    return {
      ...n,
      ...(id ? { attrs: { ...n.attrs, src: `/api/v1/files/${id}` } } : {}),
      ...(n.content ? { content: n.content.map(walk) } : {}),
    };
  };
  return walk(content as PMNode);
}

export async function readFile(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [a] = await tx.select().from(noteAttachments).where(eq(noteAttachments.id, id));
    return a;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.storageKey }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime } : null;
}

// ── Links between items ("Ligações") ───────────────────────────────────────
export type ItemRef = { type: string; id: string };
const order = (a: ItemRef, b: ItemRef): [ItemRef, ItemRef] =>
  `${a.type}:${a.id}` < `${b.type}:${b.id}` ? [a, b] : [b, a];

export async function linkItems(auth: AuthContext, a: ItemRef, b: ItemRef) {
  if (a.type === b.type && a.id === b.id) throw new ApiError(400, 'invalid_input');
  const [x, y] = order(a, b);
  await asUser(auth, async (tx) => {
    await assertOwned(tx, x);
    await assertOwned(tx, y);
    await tx
      .insert(itemLinks)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        aType: x.type,
        aId: x.id,
        bType: y.type,
        bId: y.id,
      })
      .onConflictDoNothing();
  });
}

export async function unlinkItems(auth: AuthContext, a: ItemRef, b: ItemRef) {
  const [x, y] = order(a, b);
  await asUser(auth, (tx) =>
    tx
      .delete(itemLinks)
      .where(
        and(
          eq(itemLinks.aType, x.type),
          eq(itemLinks.aId, x.id),
          eq(itemLinks.bType, y.type),
          eq(itemLinks.bId, y.id),
        ),
      ),
  );
}

/** Item types that can be linked today; tasks, issues… join as their modules arrive. */
const LINKABLE: Record<string, { table: typeof notes; title: typeof notes.title }> = {
  note: { table: notes, title: notes.title },
};

async function assertOwned(tx: Tx, ref: ItemRef) {
  const L = LINKABLE[ref.type];
  if (!L) throw new ApiError(400, 'invalid_input');
  const [r] = await tx
    .select({ id: L.table.id })
    .from(L.table)
    .where(and(eq(L.table.id, ref.id), isNull(L.table.deletedAt)));
  if (!r) throw new ApiError(404, 'not_found');
}

export async function linksOf(auth: AuthContext, ref: ItemRef) {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(itemLinks)
      .where(
        or(
          and(eq(itemLinks.aType, ref.type), eq(itemLinks.aId, ref.id)),
          and(eq(itemLinks.bType, ref.type), eq(itemLinks.bId, ref.id)),
        ),
      );
    const others = rows.map((r) =>
      r.aType === ref.type && r.aId === ref.id ? { type: r.bType, id: r.bId } : { type: r.aType, id: r.aId },
    );
    const noteIds = others.filter((o) => o.type === 'note').map((o) => o.id);
    const titles = noteIds.length
      ? await tx
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(and(inArray(notes.id, noteIds), isNull(notes.deletedAt)))
      : [];
    const t = new Map(titles.map((x) => [x.id, x.title]));
    return others.filter((o) => t.has(o.id)).map((o) => ({ ...o, title: t.get(o.id) ?? '' }));
  });
}

/** Items the user can link to (search box in "Ligações"). */
export async function linkCandidates(auth: AuthContext, ref: ItemRef, query: string) {
  const items = await listNotes(auth, { search: query || undefined });
  return items
    .filter((n) => !(ref.type === 'note' && n.id === ref.id))
    .slice(0, 8)
    .map((n) => ({ type: 'note', id: n.id, title: n.title, sub: n.updatedAt }));
}

export { docChecklist };

/** Sidebar badges (prototype: count next to each module). */
export async function contentCounts(auth: AuthContext, modules: ReadonlySet<string>) {
  const out: Record<string, number> = {};
  if (modules.has('notes'))
    out.notes = await asUser(auth, async (tx) => {
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(notes)
        .where(isNull(notes.deletedAt));
      return r?.n ?? 0;
    });
  return out;
}
