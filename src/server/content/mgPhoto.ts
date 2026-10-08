import 'server-only';
import { eq } from 'drizzle-orm';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mgPeople } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { sniffImage } from '@/server/assets';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Management › Recursos: a person's photo. The browser crops and re-encodes it
// (256 px JPEG) first; the server checks the real signature and size, keeps it
// in the private bucket and streams it only to the tenant's own users.

export const PHOTO_MAX = 1024 * 1024;

/** The version shown to the browser (the random part of the key), '' without a photo. */
// key: tenants/<tenant>/mg-people/<person uuid>-<token>
export const photoVersion = (key: string | null) => (key ? (key.split('/').pop() ?? '').slice(37) : '');

async function keyOf(auth: AuthContext, id: string) {
  const [p] = await asUser(auth, (tx) =>
    tx.select({ key: mgPeople.photoKey }).from(mgPeople).where(eq(mgPeople.id, id)),
  );
  if (!p) throw new ApiError(404, 'not_found');
  return p.key;
}

const drop = (key: string | null) =>
  key
    ? s3()
        .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }))
        .catch(() => {}) // the storage sweep removes whatever is left
    : Promise.resolve();

export async function putPersonPhoto(auth: AuthContext, id: string, data: Uint8Array): Promise<string> {
  if (!data.length) throw new ApiError(400, 'empty_file');
  if (data.length > PHOTO_MAX) throw new ApiError(413, 'file_too_large', undefined, { max: PHOTO_MAX });
  const type = sniffImage(data);
  if (!type) throw new ApiError(415, 'unsupported_image');
  const old = await keyOf(auth, id);
  const key = `tenants/${auth.tenant.id}/mg-people/${id}-${randomToken(9)}`;
  await s3().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: type }));
  const r = await asUser(auth, (tx) =>
    tx.update(mgPeople).set({ photoKey: key }).where(eq(mgPeople.id, id)).returning({ id: mgPeople.id }),
  );
  if (!r.length) {
    await drop(key);
    throw new ApiError(404, 'not_found');
  }
  await drop(old);
  return photoVersion(key);
}

export async function deletePersonPhoto(auth: AuthContext, id: string) {
  const old = await keyOf(auth, id);
  await asUser(auth, (tx) => tx.update(mgPeople).set({ photoKey: null }).where(eq(mgPeople.id, id)));
  await drop(old);
}

export async function readPersonPhoto(auth: AuthContext, id: string) {
  const key = await keyOf(auth, id);
  if (!key) throw new ApiError(404, 'not_found');
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  if (!obj.Body) throw new ApiError(404, 'not_found');
  const body = await obj.Body.transformToByteArray();
  return { body, type: sniffImage(body) ?? 'application/octet-stream' };
}
