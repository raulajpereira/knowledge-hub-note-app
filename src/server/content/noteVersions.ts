import 'server-only';
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, noteVersions, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asSharer, type Tx } from './tenant';

// Note history ("Histórico"). The server decides when to keep a version, in
// the save path itself (never on the client's word): the state a note had
// before a save is kept when the newest version is more than 10 minutes old,
// and always before a restore. The newest 50 are kept, plus the very first.
// Members of a shared folder with "edit" see and restore; "read" only see.

export const SNAPSHOT_EVERY_MS = 10 * 60_000;
export const KEEP_VERSIONS = 50;

export type NoteState = {
  id: string;
  tenantId: string;
  ownerId: string;
  title: string;
  content: unknown;
  contentText: string;
};

export type NoteVersionItem = {
  id: string;
  createdAt: string;
  reason: 'auto' | 'restore';
  title: string;
  chars: number;
  /** characters added (+) or removed (−) since the version before it */
  delta: number | null;
  author: string | null;
  /** first words, for the list */
  excerpt: string;
};

const isBlank = (s: NoteState) =>
  !s.title.trim() && !s.contentText.trim() && !JSON.stringify(s.content ?? '').includes('"image"');

/** The note row as it is now, locked for this save (null: not editable by the caller). */
export async function lockNote(tx: Tx, id: string): Promise<NoteState | null> {
  const [r] = await tx
    .select({
      id: notes.id,
      tenantId: notes.tenantId,
      ownerId: notes.ownerId,
      title: notes.title,
      content: notes.content,
      contentText: notes.contentText,
    })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .for('update');
  return r ?? null;
}

async function addVersion(tx: Tx, auth: AuthContext, s: NoteState, reason: 'auto' | 'restore') {
  await tx.insert(noteVersions).values({
    // the note's tenant (a member of a shared folder may belong to another one)
    tenantId: s.tenantId,
    ownerId: s.ownerId,
    noteId: s.id,
    authorId: auth.user.id,
    title: s.title,
    content: s.content,
    contentText: s.contentText,
    chars: s.contentText.length,
    reason,
  });
  // keep the newest KEEP_VERSIONS and the first one
  const keep = tx
    .select({ id: noteVersions.id })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, s.id))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .limit(KEEP_VERSIONS);
  const first = tx
    .select({ id: noteVersions.id })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, s.id))
    .orderBy(asc(noteVersions.createdAt), asc(noteVersions.id))
    .limit(1);
  await tx
    .delete(noteVersions)
    .where(
      and(
        eq(noteVersions.noteId, s.id),
        notInArray(noteVersions.id, keep),
        notInArray(noteVersions.id, first),
      ),
    );
}

/**
 * Called by every save that changes the title or the document, with the state
 * before the save: keeps it as a version when the newest one is older than
 * 10 minutes (or there is none), unless it is empty or the same as that one.
 * `force` (restore) skips the 10-minute rule.
 */
export async function snapshotIfDue(
  tx: Tx,
  auth: AuthContext,
  before: NoteState,
  opts: { force?: boolean; now?: Date } = {},
) {
  if (isBlank(before)) return false;
  const [last] = await tx
    .select({
      createdAt: noteVersions.createdAt,
      title: noteVersions.title,
      same: sql<boolean>`${noteVersions.content} = ${JSON.stringify(before.content)}::jsonb`,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, before.id))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .limit(1);
  if (last && last.same && last.title === before.title) return false;
  const now = (opts.now ?? new Date()).getTime();
  if (!opts.force && last && now - last.createdAt.getTime() < SNAPSHOT_EVERY_MS) return false;
  await addVersion(tx, auth, before, opts.force ? 'restore' : 'auto');
  return true;
}

/** The versions of a note the caller can see (owner, or a member of its shared folder). */
export async function listNoteVersions(auth: AuthContext, noteId: string): Promise<NoteVersionItem[]> {
  const rows = await asSharer(auth, async (tx) => {
    const [n] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    if (!n) throw new ApiError(404, 'not_found');
    return tx
      .select({
        id: noteVersions.id,
        createdAt: noteVersions.createdAt,
        reason: noteVersions.reason,
        title: noteVersions.title,
        chars: noteVersions.chars,
        authorId: noteVersions.authorId,
        excerpt: sql<string>`left(${noteVersions.contentText}, 160)`,
      })
      .from(noteVersions)
      .where(eq(noteVersions.noteId, noteId))
      .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id));
  });
  // names of the people who edited (members of the same folder; not under RLS)
  const ids = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const names = ids.length
    ? new Map(
        (await db().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map(
          (u) => [u.id, u.name],
        ),
      )
    : new Map<string, string>();
  return rows.map((r, i) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    reason: r.reason,
    title: r.title,
    chars: r.chars,
    delta: rows[i + 1] ? r.chars - rows[i + 1]!.chars : null,
    author: r.authorId ? (names.get(r.authorId) ?? null) : null,
    excerpt: r.excerpt.replace(/\s+/g, ' ').trim(),
  }));
}

/** One version, to preview it (read-only). */
export async function getNoteVersion(auth: AuthContext, noteId: string, versionId: string) {
  return asSharer(auth, async (tx) => {
    const [v] = await tx
      .select({
        id: noteVersions.id,
        title: noteVersions.title,
        content: noteVersions.content,
        createdAt: noteVersions.createdAt,
      })
      .from(noteVersions)
      .innerJoin(notes, and(eq(notes.id, noteVersions.noteId), isNull(notes.deletedAt)))
      .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)));
    if (!v) throw new ApiError(404, 'not_found');
    return { ...v, createdAt: v.createdAt.toISOString() };
  });
}

/**
 * "Restaurar esta versão": the current state is kept as a version first, then
 * the note takes the version's title and document (only with edit rights:
 * RLS lets nobody else lock or update the note).
 */
export async function restoreNoteVersion(auth: AuthContext, noteId: string, versionId: string) {
  return asSharer(auth, async (tx) => {
    const cur = await lockNote(tx, noteId);
    if (!cur) throw new ApiError(404, 'not_found');
    const [v] = await tx
      .select({ title: noteVersions.title, content: noteVersions.content, text: noteVersions.contentText })
      .from(noteVersions)
      .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)));
    if (!v) throw new ApiError(404, 'not_found');
    await snapshotIfDue(tx, auth, cur, { force: true });
    const [n] = await tx
      .update(notes)
      .set({ title: v.title, content: v.content, contentText: v.text, updatedAt: new Date() })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning();
    if (!n) throw new ApiError(404, 'not_found');
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      tags: n.tags,
      folderId: n.folderId,
      sharedFolderId: n.sharedFolderId,
      mine: n.ownerId === auth.user.id,
      favorite: n.favorite,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  });
}
