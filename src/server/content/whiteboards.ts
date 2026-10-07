import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import {
  artifacts,
  issues,
  notes,
  snippets,
  taskSubtasks,
  tasks,
  voiceNotes,
  whiteboardImages,
  whiteboards,
} from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { LINK_TYPES, type LinkType, type WbEl } from '@/lib/whiteboard';
import { ApiError } from '@/server/errors';
import { sniffImage } from '@/server/assets';
import { s3 } from '@/lib/storage';
import { assertWithinLimit } from '@/server/licensing/entitlements';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';

// Whiteboard (Whiteboard.dc.html): several boards per user, each an element
// list saved as a whole ("last write wins" + conflict warning by updated_at,
// DECISIONS_AND_INFRA: no real time). Images live in the private bucket.

export type Board = { id: string; name: string; els: WbEl[]; createdAt: string; updatedAt: string };
export type BoardItem = { k: string; type: LinkType; title: string; sub: string };

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_IMAGES = 300;

const cols = {
  id: whiteboards.id,
  name: whiteboards.name,
  doc: whiteboards.doc,
  createdAt: whiteboards.createdAt,
  updatedAt: whiteboards.updatedAt,
};
const toBoard = (r: {
  id: string;
  name: string;
  doc: { els: unknown[] };
  createdAt: Date;
  updatedAt: Date;
}): Board => ({
  id: r.id,
  name: r.name,
  els: r.doc.els as WbEl[],
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Module that has to be in the plan for an item type to be offered on a board. */
export const moduleOfLink = (t: LinkType) =>
  ({
    note: 'notes',
    task: 'tasks',
    voice: 'voice',
    issue: 'issues',
    artifact: 'artifacts',
    snippet: 'devlib',
  })[t];

const SOURCES = {
  note: { table: notes, title: notes.title, at: notes.updatedAt },
  task: { table: tasks, title: tasks.title, at: tasks.createdAt },
  voice: { table: voiceNotes, title: voiceNotes.title, at: voiceNotes.createdAt },
  issue: { table: issues, title: issues.title, at: issues.createdAt },
  artifact: { table: artifacts, title: artifacts.title, at: artifacts.updatedAt },
  snippet: { table: snippets, title: snippets.title, at: snippets.updatedAt },
} as const;

/** Titles of the app items placed on boards ("Elemento removido" when missing). */
async function resolveRefs(tx: Tx, boards: Board[], types: LinkType[]) {
  const want = new Map<LinkType, Set<string>>();
  for (const b of boards)
    for (const e of b.els)
      if (e.t === 'link') {
        const [type, id] = e.ref.split(':') as [LinkType, string];
        if (types.includes(type)) (want.get(type) ?? want.set(type, new Set()).get(type)!).add(id);
      }
  const out: Record<string, BoardItem> = {};
  for (const [type, ids] of want) {
    const S = SOURCES[type];
    const rows = await tx
      .select({ id: S.table.id, title: S.title, at: S.at })
      .from(S.table)
      .where(and(inArray(S.table.id, [...ids]), isNull(S.table.deletedAt)));
    for (const r of rows)
      out[`${type}:${r.id}`] = { k: `${type}:${r.id}`, type, title: r.title, sub: r.at.toISOString() };
  }
  return out;
}

export async function listBoards(auth: AuthContext, types: LinkType[]) {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(whiteboards)
      .where(isNull(whiteboards.deletedAt))
      .orderBy(desc(whiteboards.updatedAt))
      .limit(500);
    const boards = rows.map(toBoard);
    return { boards, items: await resolveRefs(tx, boards, types) };
  });
}

async function countBoards(tx: Tx) {
  const [{ n }] = (await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(whiteboards)
    .where(isNull(whiteboards.deletedAt))) as [{ n: number }];
  return n;
}

export async function createBoard(auth: AuthContext, name: string): Promise<Board> {
  return asUser(auth, async (tx) => {
    const n = await countBoards(tx);
    await assertWithinLimit(auth.tenant.id, 'whiteboards', n);
    if (n >= 500) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(whiteboards)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, name, doc: { els: [] } })
      .returning(cols);
    return toBoard(r!);
  });
}

/**
 * Saves a board. `base` is the updated_at the client loaded; when somebody
 * saved in between (another tab or device) the save is refused with 409
 * unless `force` — the client then offers to reload or keep its version.
 */
export async function updateBoard(
  auth: AuthContext,
  id: string,
  patch: { name?: string; els?: WbEl[]; base?: string; force?: boolean },
): Promise<{ updatedAt: string }> {
  return asUser(auth, async (tx) => {
    const [cur] = await tx
      .select({ updatedAt: whiteboards.updatedAt })
      .from(whiteboards)
      .where(and(eq(whiteboards.id, id), isNull(whiteboards.deletedAt)))
      .for('update');
    if (!cur) throw new ApiError(404, 'not_found');
    if (patch.base && !patch.force && cur.updatedAt.toISOString() !== patch.base)
      throw new ApiError(409, 'conflict', undefined, { updatedAt: cur.updatedAt.toISOString() });
    // strictly increasing, so two saves in the same millisecond still differ
    const now = new Date(Math.max(Date.now(), cur.updatedAt.getTime() + 1));
    const [r] = await tx
      .update(whiteboards)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.els ? { doc: { els: patch.els } } : {}),
        updatedAt: now,
      })
      .where(eq(whiteboards.id, id))
      .returning({ updatedAt: whiteboards.updatedAt });
    return { updatedAt: r!.updatedAt.toISOString() };
  });
}

/** Copies a board; its images are copied too so each board owns its files. */
export async function duplicateBoard(auth: AuthContext, id: string, suffix: string): Promise<Board> {
  return asUser(auth, async (tx) => {
    const [src] = await tx
      .select(cols)
      .from(whiteboards)
      .where(and(eq(whiteboards.id, id), isNull(whiteboards.deletedAt)));
    if (!src) throw new ApiError(404, 'not_found');
    await assertWithinLimit(auth.tenant.id, 'whiteboards', await countBoards(tx));
    const [dst] = await tx
      .insert(whiteboards)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        name: `${src.name}${suffix}`.slice(0, 200),
        doc: { els: [] },
      })
      .returning({ id: whiteboards.id });
    const files = await tx.select().from(whiteboardImages).where(eq(whiteboardImages.boardId, id));
    const map = new Map<string, string>();
    for (const f of files) {
      const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: f.storageKey }));
      const body = await obj.Body?.transformToByteArray();
      if (!body) continue;
      const key = `tenants/${auth.tenant.id}/whiteboards/${dst!.id}/${randomToken(12)}`;
      await s3().send(
        new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: f.mime }),
      );
      const [a] = await tx
        .insert(whiteboardImages)
        .values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          boardId: dst!.id,
          storageKey: key,
          mime: f.mime,
          size: f.size,
        })
        .returning({ id: whiteboardImages.id });
      map.set(f.id, a!.id);
    }
    const els = (src.doc.els as WbEl[]).map((e) =>
      e.t === 'image' && map.has(e.file) ? { ...e, file: map.get(e.file)! } : e,
    );
    const [r] = await tx
      .update(whiteboards)
      .set({ doc: { els } })
      .where(eq(whiteboards.id, dst!.id))
      .returning(cols);
    return toBoard(r!);
  });
}

export async function trashBoard(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(whiteboards)
      .set({ deletedAt: new Date() })
      .where(and(eq(whiteboards.id, id), isNull(whiteboards.deletedAt)))
      .returning({ id: whiteboards.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Trash purge: the boards go, with their stored images. */
export async function purgeBoardsTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  const keys = await tx
    .select({ key: whiteboardImages.storageKey })
    .from(whiteboardImages)
    .where(inArray(whiteboardImages.boardId, ids));
  await tx.delete(whiteboards).where(inArray(whiteboards.id, ids));
  for (const k of keys)
    await s3()
      .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: k.key }))
      .catch(() => {});
}

// ── Images ─────────────────────────────────────────────────────────────────
export async function addBoardImage(auth: AuthContext, boardId: string, data: Uint8Array): Promise<string> {
  if (data.length > MAX_IMAGE) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_IMAGE });
  const gif = data.length >= 6 && String.fromCharCode(...data.subarray(0, 4)) === 'GIF8';
  const mime = sniffImage(data) ?? (gif ? 'image/gif' : null);
  if (!mime) throw new ApiError(415, 'unsupported_image');
  return asUser(auth, async (tx) => {
    const [b] = await tx
      .select({ id: whiteboards.id })
      .from(whiteboards)
      .where(and(eq(whiteboards.id, boardId), isNull(whiteboards.deletedAt)));
    if (!b) throw new ApiError(404, 'not_found');
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(whiteboardImages)
      .where(eq(whiteboardImages.boardId, boardId))) as [{ n: number }];
    if (n >= MAX_IMAGES) throw new ApiError(400, 'too_many_items');
    const key = `tenants/${auth.tenant.id}/whiteboards/${boardId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: mime }),
    );
    const [a] = await tx
      .insert(whiteboardImages)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        boardId,
        storageKey: key,
        mime,
        size: data.length,
      })
      .returning({ id: whiteboardImages.id });
    return a!.id;
  });
}

export async function readBoardImage(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [a] = await tx.select().from(whiteboardImages).where(eq(whiteboardImages.id, id));
    return a;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.storageKey }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime } : null;
}

// ── App items ("Elemento da app") ──────────────────────────────────────────
/** Search for the "Adicionar elemento da app" dialog: newest first, 12 per type. */
export async function boardItems(auth: AuthContext, query: string, types: LinkType[]): Promise<BoardItem[]> {
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return asUser(auth, async (tx) => {
    const out: BoardItem[] = [];
    for (const type of types) {
      const S = SOURCES[type];
      const rows = await tx
        .select({ id: S.table.id, title: S.title, at: S.at })
        .from(S.table)
        .where(and(isNull(S.table.deletedAt), query ? ilike(S.title, like) : sql`true`))
        .orderBy(desc(S.at))
        .limit(12);
      for (const r of rows) out.push({ k: `${type}:${r.id}`, type, title: r.title, sub: r.at.toISOString() });
    }
    return out;
  });
}

export type Peek = {
  type: LinkType;
  title: string;
  meta: Array<{ k: string; v: string }>;
  subs: Array<{ t: string; done: boolean }>;
  body: string;
  code: boolean;
};

const day = (d: Date | string | null) => (d ? (typeof d === 'string' ? d : d.toISOString()) : '');

/**
 * What the popup shows for an item placed on a board (prototype `wp`): a few
 * fields, subtasks and the text. Plain text only — never the item's HTML.
 */
export async function peekItem(auth: AuthContext, type: LinkType, id: string): Promise<Peek> {
  if (!LINK_TYPES.includes(type)) throw new ApiError(400, 'invalid_input');
  return asUser(auth, async (tx) => {
    const nf = () => new ApiError(404, 'not_found');
    if (type === 'note') {
      const [r] = await tx
        .select({ title: notes.title, body: notes.contentText, c: notes.createdAt, u: notes.updatedAt })
        .from(notes)
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)));
      if (!r) throw nf();
      return {
        type,
        title: r.title,
        meta: [
          { k: 'created', v: day(r.c) },
          { k: 'updated', v: day(r.u) },
        ],
        subs: [],
        body: r.body,
        code: false,
      };
    }
    if (type === 'task') {
      const [r] = await tx
        .select({
          title: tasks.title,
          kind: tasks.type,
          prio: tasks.priority,
          due: tasks.dueOn,
          body: tasks.notes,
          c: tasks.createdAt,
        })
        .from(tasks)
        .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
      if (!r) throw nf();
      const subs = await tx
        .select({ t: taskSubtasks.title, done: taskSubtasks.done })
        .from(taskSubtasks)
        .where(eq(taskSubtasks.taskId, id))
        .orderBy(asc(taskSubtasks.sort));
      return {
        type,
        title: r.title,
        meta: [
          { k: 'ttype', v: r.kind },
          { k: 'prio', v: r.prio },
          { k: 'due', v: day(r.due) },
          { k: 'created', v: day(r.c) },
        ],
        subs,
        body: r.body,
        code: false,
      };
    }
    if (type === 'issue') {
      const [r] = await tx
        .select({
          title: issues.title,
          status: issues.status,
          prio: issues.priority,
          due: issues.dueOn,
          waiting: issues.waiting,
          desc: issues.description,
          notes: issues.notes,
          c: issues.createdAt,
        })
        .from(issues)
        .where(and(eq(issues.id, id), isNull(issues.deletedAt)));
      if (!r) throw nf();
      return {
        type,
        title: r.title,
        meta: [
          { k: 'status', v: r.status },
          { k: 'prio', v: r.prio },
          { k: 'due', v: day(r.due) },
          { k: 'waiting', v: r.waiting },
          { k: 'created', v: day(r.c) },
        ],
        subs: [],
        body: [r.desc, r.notes].filter(Boolean).join('\n\n'),
        code: false,
      };
    }
    if (type === 'voice') {
      const [r] = await tx
        .select({
          title: voiceNotes.title,
          ms: voiceNotes.durationMs,
          tr: voiceNotes.transcript,
          notes: voiceNotes.notes,
          c: voiceNotes.createdAt,
        })
        .from(voiceNotes)
        .where(and(eq(voiceNotes.id, id), isNull(voiceNotes.deletedAt)));
      if (!r) throw nf();
      const s = Math.round(r.ms / 1000);
      return {
        type,
        title: r.title,
        meta: [
          { k: 'date', v: day(r.c) },
          { k: 'dur', v: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` },
        ],
        subs: [],
        body: r.tr || r.notes,
        code: false,
      };
    }
    if (type === 'artifact') {
      const [r] = await tx
        .select({
          title: artifacts.title,
          desc: artifacts.description,
          c: artifacts.createdAt,
          u: artifacts.updatedAt,
        })
        .from(artifacts)
        .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)));
      if (!r) throw nf();
      return {
        type,
        title: r.title,
        meta: [
          { k: 'created', v: day(r.c) },
          { k: 'updated', v: day(r.u) },
        ],
        subs: [],
        body: r.desc,
        code: false,
      };
    }
    const [r] = await tx
      .select({
        title: snippets.title,
        kind: snippets.type,
        desc: snippets.description,
        files: snippets.files,
        c: snippets.createdAt,
      })
      .from(snippets)
      .where(and(eq(snippets.id, id), isNull(snippets.deletedAt)));
    if (!r) throw nf();
    return {
      type,
      title: r.title,
      meta: [
        { k: 'type', v: r.kind },
        { k: 'desc', v: r.desc.slice(0, 120) },
        { k: 'created', v: day(r.c) },
      ],
      subs: [],
      body: r.files
        .filter((f) => f.code.trim())
        .map((f) => (r.files.length > 1 ? `* ${f.name}\n${f.code}` : f.code))
        .join('\n\n'),
      code: true,
    };
  });
}
