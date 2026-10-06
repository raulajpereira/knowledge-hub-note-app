import 'server-only';
import { and, eq } from 'drizzle-orm';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/db/client';
import { userAssets } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';

// Profile photo, background photo and brand logo. The browser resizes and
// re-encodes the image (PNG/JPEG) before uploading; the server still checks
// the real file signature and size, stores it in the private bucket and only
// ever streams it back to its owner (no public or pre-signed URLs, so the
// MinIO endpoint never has to be reachable from the internet).

export const ASSET_KINDS = ['avatar', 'background', 'logo'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

const LIMIT: Record<AssetKind, number> = {
  avatar: 1024 * 1024,
  background: 4 * 1024 * 1024,
  logo: 1024 * 1024,
};
/** Module needed to upload (Personalização add-ons); the avatar is for everyone. */
const MODULE: Record<AssetKind, string | null> = { avatar: null, background: 'bgphoto', logo: 'brand' };

export const isAssetKind = (v: string): v is AssetKind => (ASSET_KINDS as readonly string[]).includes(v);
export const assetLimit = (k: AssetKind) => LIMIT[k];
export const assetModule = (k: AssetKind) => MODULE[k];

/** Content type from the file's magic bytes, or null if it isn't PNG/JPEG/WebP. */
export function sniffImage(buf: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export async function listAssets(userId: string): Promise<Partial<Record<AssetKind, number>>> {
  const rows = await db()
    .select({ kind: userAssets.kind, updatedAt: userAssets.updatedAt })
    .from(userAssets)
    .where(eq(userAssets.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.kind, r.updatedAt.getTime()]));
}

export async function putAsset(
  auth: AuthContext,
  kind: AssetKind,
  data: Uint8Array,
  modules: ReadonlySet<string>,
): Promise<number> {
  const mod = MODULE[kind];
  if (mod && !modules.has(mod)) throw new ApiError(403, 'module_not_included', undefined, { module: mod });
  if (!data.length) throw new ApiError(400, 'empty_file');
  if (data.length > LIMIT[kind]) throw new ApiError(413, 'file_too_large', undefined, { max: LIMIT[kind] });
  const type = sniffImage(data);
  if (!type) throw new ApiError(415, 'unsupported_image');

  const key = `users/${auth.user.id}/${kind}-${randomToken(9)}`;
  const Bucket = env().S3_BUCKET;
  await s3().send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: type }));
  const [old] = await db()
    .select({ key: userAssets.storageKey })
    .from(userAssets)
    .where(and(eq(userAssets.userId, auth.user.id), eq(userAssets.kind, kind)));
  const now = new Date();
  await db()
    .insert(userAssets)
    .values({
      userId: auth.user.id,
      kind,
      storageKey: key,
      contentType: type,
      bytes: data.length,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userAssets.userId, userAssets.kind],
      set: { storageKey: key, contentType: type, bytes: data.length, updatedAt: now },
    });
  if (old && old.key !== key)
    await s3()
      .send(new DeleteObjectCommand({ Bucket, Key: old.key }))
      .catch(() => {});
  return now.getTime();
}

export async function deleteAsset(auth: AuthContext, kind: AssetKind): Promise<void> {
  const [row] = await db()
    .delete(userAssets)
    .where(and(eq(userAssets.userId, auth.user.id), eq(userAssets.kind, kind)))
    .returning({ key: userAssets.storageKey });
  if (row)
    await s3()
      .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: row.key }))
      .catch(() => {});
}

export async function readAsset(
  userId: string,
  kind: AssetKind,
): Promise<{ body: Uint8Array; contentType: string; updatedAt: Date } | null> {
  const [row] = await db()
    .select()
    .from(userAssets)
    .where(and(eq(userAssets.userId, userId), eq(userAssets.kind, kind)));
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.storageKey }));
  const body = await obj.Body?.transformToByteArray();
  if (!body) return null;
  return { body, contentType: row.contentType, updatedAt: row.updatedAt };
}
