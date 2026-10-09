import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { driveFiles, sharedFolders, users } from '@/db/schema';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { redis } from '@/lib/redis';
import { randomToken } from '@/lib/crypto';
import { cleanName, FILES_MAX_MB, FILES_QUOTA_MB, UPLOAD_PART } from '@/lib/drive';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asSharer, asUser, type Tx } from './tenant';
import {
  checkKindFolder,
  createKindFolder,
  deleteKindFolder,
  listKindFolders,
  renameKindFolder,
  type KindFolder,
} from './kindFolders';

// Ficheiros: files in object storage, in flat folders (as Notes/Artifacts)
// or in shared folders. Uploads go in chunks (S3 multipart) so a file never
// sits whole in memory and no request passes the proxy's limit; reads stream,
// with byte ranges. Each user has a space quota and a largest-file size (the
// defaults, or what the console set for them); files in the Trash still count.

export type DriveFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  sharedFolderId: string | null;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};
export type DriveFolder = KindFolder;
export type DriveLimits = { used: number; quota: number; maxFile: number };

const MB = 1024 * 1024;
const cols = {
  id: driveFiles.id,
  name: driveFiles.name,
  mime: driveFiles.mime,
  size: driveFiles.size,
  folderId: driveFiles.folderId,
  sharedFolderId: driveFiles.sharedFolderId,
  ownerId: driveFiles.ownerId,
  createdAt: driveFiles.createdAt,
  updatedAt: driveFiles.updatedAt,
};
type Row = {
  id: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  sharedFolderId: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};
const toFile = (r: Row, me: string): DriveFile => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: Number(r.size),
  folderId: r.folderId,
  sharedFolderId: r.sharedFolderId,
  mine: r.ownerId === me,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** The caller's space: used (own files, Trash included), quota and largest file, in bytes. */
async function limitsTx(tx: Tx, auth: AuthContext): Promise<DriveLimits> {
  const [u] = await tx
    .select({ q: users.filesQuotaMb, m: users.filesMaxMb })
    .from(users)
    .where(eq(users.id, auth.user.id));
  const [{ used }] = (await tx
    .select({ used: sql<string>`coalesce(sum(${driveFiles.size}), 0)` })
    .from(driveFiles)
    .where(eq(driveFiles.ownerId, auth.user.id))) as [{ used: string }];
  return {
    used: Number(used),
    quota: (u?.q ?? FILES_QUOTA_MB) * MB,
    maxFile: (u?.m ?? FILES_MAX_MB) * MB,
  };
}
export const driveLimits = (auth: AuthContext) => asUser(auth, (tx) => limitsTx(tx, auth));

export async function listDrive(
  auth: AuthContext,
  shared?: { id: string; folderId: string | null },
): Promise<{ files: DriveFile[]; folders: DriveFolder[]; limits: DriveLimits }> {
  return (shared ? asSharer : asUser)(auth, async (tx) => {
    const inShared = shared
      ? shared.folderId
        ? or(eq(driveFiles.sharedFolderId, shared.id), eq(driveFiles.folderId, shared.folderId))
        : eq(driveFiles.sharedFolderId, shared.id)
      : undefined;
    const rows = (await tx
      .select(cols)
      .from(driveFiles)
      .where(and(isNull(driveFiles.deletedAt), inShared))
      .orderBy(desc(driveFiles.createdAt))
      .limit(10_000)) as Row[];
    const fs = shared ? [] : await listKindFolders(tx, 'files');
    return { files: rows.map((r) => toFile(r, auth.user.id)), folders: fs, limits: await limitsTx(tx, auth) };
  });
}

// ── Folders (flat, as in Notes and Artifacts) ───────────────────────────────
export const createDriveFolder = (auth: AuthContext, name: string) => createKindFolder(auth, 'files', name);
export const renameDriveFolder = (auth: AuthContext, id: string, name: string) =>
  renameKindFolder(auth, 'files', id, name);
/** Removing a folder keeps its files (they go to "Sem pasta"). */
export const deleteDriveFolder = (auth: AuthContext, id: string) => deleteKindFolder(auth, 'files', id);
const checkFolder = (tx: Tx, id: string | null | undefined) => checkKindFolder(tx, 'files', id);

// ── Uploads (S3 multipart, chunk by chunk) ──────────────────────────────────
type Pending = {
  owner: string;
  tenant: string;
  key: string;
  s3: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  sharedFolderId: string | null;
  parts: Record<string, string>;
};
const pendingKey = (id: string) => `kh:drive:up:${id}`;
const parts = (size: number) => Math.max(1, Math.ceil(size / UPLOAD_PART));

async function loadPending(auth: AuthContext, id: string): Promise<Pending> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) throw new ApiError(404, 'not_found');
  const raw = await redis().get(pendingKey(id));
  const p = raw ? (JSON.parse(raw) as Pending) : null;
  if (!p || p.owner !== auth.user.id || p.tenant !== auth.tenant.id) throw new ApiError(404, 'not_found');
  return p;
}

/** Checks the limits and the target folder, and opens the upload. */
export async function startUpload(
  auth: AuthContext,
  input: {
    name: string;
    size: number;
    mime?: string;
    folderId?: string | null;
    sharedFolderId?: string | null;
  },
): Promise<{ uploadId: string; partSize: number; parts: number }> {
  const name = cleanName(input.name);
  const mime = (input.mime || 'application/octet-stream').slice(0, 200);
  const { folderId, sharedFolderId } = await asSharer(auth, async (tx) => {
    const lim = await limitsTx(tx, auth);
    if (input.size > lim.maxFile) throw new ApiError(413, 'file_too_large', undefined, { max: lim.maxFile });
    if (lim.used + input.size > lim.quota)
      throw new ApiError(403, 'limit_reached', undefined, { resource: 'files_storage', max: lim.quota });
    let sf: string | null = null;
    if (input.sharedFolderId) {
      // the owner, or an 'edit' member (the row trigger checks it again)
      const [f] = await tx
        .select({ id: sharedFolders.id, ownerId: sharedFolders.ownerId })
        .from(sharedFolders)
        .where(and(eq(sharedFolders.id, input.sharedFolderId), eq(sharedFolders.kind, 'files')));
      if (!f) throw new ApiError(404, 'folder_not_found');
      if (f.ownerId !== auth.user.id) {
        const [{ perm }] = (await tx.execute(sql`select kh_share_member(${f.id}) as perm`)) as unknown as [
          { perm: string | null },
        ];
        if (perm !== 'edit') throw new ApiError(403, 'forbidden');
      }
      sf = f.id;
    }
    return { folderId: sf ? null : await checkFolder(tx, input.folderId), sharedFolderId: sf };
  });
  const key = `tenants/${auth.tenant.id}/files/${randomToken(16)}`;
  const r = await s3().send(
    new CreateMultipartUploadCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ContentType: 'application/octet-stream',
    }),
  );
  const id = randomToken(18);
  const p: Pending = {
    owner: auth.user.id,
    tenant: auth.tenant.id,
    key,
    s3: r.UploadId!,
    name,
    mime,
    size: input.size,
    folderId,
    sharedFolderId,
    parts: {},
  };
  await redis().set(pendingKey(id), JSON.stringify(p), 'EX', 86_400);
  return { uploadId: id, partSize: UPLOAD_PART, parts: parts(input.size) };
}

/** One chunk (1-based); every chunk but the last is exactly the part size. */
export async function uploadPart(auth: AuthContext, id: string, n: number, body: Uint8Array) {
  const p = await loadPending(auth, id);
  const total = parts(p.size);
  if (!Number.isInteger(n) || n < 1 || n > total) throw new ApiError(400, 'invalid_input');
  const expected = n < total ? UPLOAD_PART : p.size - UPLOAD_PART * (total - 1);
  if (body.byteLength !== expected) throw new ApiError(400, 'invalid_input', undefined, { expected });
  const r = await s3().send(
    new UploadPartCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3, PartNumber: n, Body: body }),
  );
  // read-modify-write of the part list: chunks of one upload are sent in order
  const cur = await loadPending(auth, id);
  cur.parts[String(n)] = r.ETag!;
  await redis().set(pendingKey(id), JSON.stringify(cur), 'KEEPTTL');
}

export async function abortUpload(auth: AuthContext, id: string) {
  const p = await loadPending(auth, id);
  await redis().del(pendingKey(id));
  await s3()
    .send(new AbortMultipartUploadCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3 }))
    .catch(() => {});
}

/** Joins the chunks, checks the size and the quota again, and keeps the file. */
export async function completeUpload(auth: AuthContext, id: string): Promise<DriveFile> {
  const p = await loadPending(auth, id);
  const total = parts(p.size);
  if (Object.keys(p.parts).length !== total) throw new ApiError(400, 'upload_incomplete');
  await redis().del(pendingKey(id));
  const drop = () =>
    s3()
      .send(new AbortMultipartUploadCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3 }))
      .catch(() => {});
  try {
    await s3().send(
      new CompleteMultipartUploadCommand({
        Bucket: env().S3_BUCKET,
        Key: p.key,
        UploadId: p.s3,
        MultipartUpload: {
          Parts: Array.from({ length: total }, (_, i) => ({
            PartNumber: i + 1,
            ETag: p.parts[String(i + 1)],
          })),
        },
      }),
    );
  } catch (e) {
    await drop();
    throw e;
  }
  const head = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: p.key }));
  const remove = () =>
    s3()
      .send(new DeleteObjectsCommand({ Bucket: env().S3_BUCKET, Delete: { Objects: [{ Key: p.key }] } }))
      .catch(() => {});
  if (head.ContentLength !== p.size) {
    await remove();
    throw new ApiError(400, 'invalid_input');
  }
  try {
    return await asSharer(auth, async (tx) => {
      // one upload completes at a time per person, so two can't both pass the quota
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kh-drive:' + auth.user.id}))`);
      const lim = await limitsTx(tx, auth);
      if (lim.used + p.size > lim.quota)
        throw new ApiError(403, 'limit_reached', undefined, { resource: 'files_storage', max: lim.quota });
      const [r] = (await tx
        .insert(driveFiles)
        .values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          folderId: p.folderId,
          sharedFolderId: p.sharedFolderId,
          name: p.name,
          mime: p.mime,
          size: p.size,
          storageKey: p.key,
        })
        .returning(cols)) as Row[];
      return toFile(r!, auth.user.id);
    });
  } catch (e) {
    await remove();
    throw e;
  }
}

// ── Reading, renaming, moving, Trash ───────────────────────────────────────
async function row(tx: Tx, id: string) {
  const [r] = (await tx
    .select({ ...cols, storageKey: driveFiles.storageKey })
    .from(driveFiles)
    .where(and(eq(driveFiles.id, id), isNull(driveFiles.deletedAt)))) as Array<Row & { storageKey: string }>;
  if (!r) throw new ApiError(404, 'not_found');
  return r;
}

/** The stored object (owner or member of its shared folder), optionally a byte range. */
export async function readDriveFile(auth: AuthContext, id: string, range?: string | null) {
  const r = await asSharer(auth, (tx) => row(tx, id));
  return readObject(r.storageKey, Number(r.size), r.name, range);
}

/** Streams an object; `range` is an HTTP Range header ("bytes=a-b"). */
export async function readObject(key: string, size: number, name: string, range?: string | null) {
  let from = 0;
  let to = size - 1;
  let partial = false;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && size > 0 && (m[1] || m[2])) {
    if (m[1]) {
      from = Number(m[1]);
      to = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    } else {
      from = Math.max(0, size - Number(m[2]));
    }
    if (from > to || from >= size) throw new ApiError(416, 'range_not_satisfiable', undefined, { size });
    partial = true;
  }
  const obj = await s3().send(
    new GetObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ...(partial ? { Range: `bytes=${from}-${to}` } : {}),
    }),
  );
  if (!obj.Body) throw new ApiError(404, 'not_found');
  return {
    name,
    size,
    stream: obj.Body.transformToWebStream(),
    length: partial ? to - from + 1 : size,
    range: partial ? `bytes ${from}-${to}/${size}` : null,
  };
}

/** Rename / move (to a folder, a shared folder, or no folder). */
export async function updateDriveFile(
  auth: AuthContext,
  id: string,
  patch: { name?: string; folderId?: string | null; sharedFolderId?: string | null },
): Promise<DriveFile> {
  return asSharer(auth, async (tx) => {
    const cur = await row(tx, id);
    const set: Partial<typeof driveFiles.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = cleanName(patch.name);
    // moving between folders is the owner's (members only rename)
    if (patch.folderId !== undefined || patch.sharedFolderId !== undefined) {
      if (cur.ownerId !== auth.user.id) throw new ApiError(403, 'forbidden');
      if (patch.sharedFolderId) {
        set.sharedFolderId = patch.sharedFolderId;
        set.folderId = null;
      } else {
        set.sharedFolderId = null;
        set.folderId = await checkFolder(tx, patch.folderId ?? null);
      }
    }
    const [r] = (await tx.update(driveFiles).set(set).where(eq(driveFiles.id, id)).returning(cols)) as Row[];
    if (!r) throw new ApiError(404, 'not_found');
    return toFile(r, auth.user.id);
  });
}

/** To the Trash (the owner's own files). */
export async function trashDriveFile(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(driveFiles)
      .set({ deletedAt: new Date() })
      .where(and(eq(driveFiles.id, id), isNull(driveFiles.deletedAt)))
      .returning({ id: driveFiles.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Removes trashed files and their objects (purging the Trash). */
export async function purgeDriveFilesTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  const rs = await tx
    .delete(driveFiles)
    .where(and(inArray(driveFiles.id, ids), sql`${driveFiles.deletedAt} is not null`))
    .returning({ key: driveFiles.storageKey });
  for (let i = 0; i < rs.length; i += 1000)
    await s3()
      .send(
        new DeleteObjectsCommand({
          Bucket: env().S3_BUCKET,
          Delete: { Objects: rs.slice(i, i + 1000).map((r) => ({ Key: r.key })), Quiet: true },
        }),
      )
      .catch(() => {}); // the storage sweep removes whatever is left
}
