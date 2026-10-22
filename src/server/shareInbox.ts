import 'server-only';
import { redis } from '@/lib/redis';
import { randomToken } from '@/lib/crypto';
import { ApiError } from '@/server/errors';

// Web Share Target (D69): what another app shares into the installed PWA
// (Android's share sheet) arrives as a multipart POST. It is kept here for a
// short while — Redis, per user, expiring by itself — until the user picks
// what to make of it on /app/share (a note, a task, Ficheiros); that page then
// uses the normal APIs (their own checks, limits and plans) and drops it.

export const SHARE_TTL_S = 60 * 60;
export const SHARE_MAX_FILES = 10;
/** per file: the note image limit is 5 MB (resized in the browser first), Ficheiros' 50 MB is too much to hold here */
export const SHARE_MAX_FILE = 15 * 1024 * 1024;
export const SHARE_MAX_TOTAL = 30 * 1024 * 1024;
export const SHARE_TYPES = /^(image\/(png|jpeg|webp|gif|heic|heif|avif)|application\/pdf)$/;

export type SharedFile = { name: string; type: string; size: number };
export type SharedItem = { title: string; text: string; url: string; files: SharedFile[]; at: string };

const key = (userId: string, token: string, part?: number) =>
  `kh:share:${userId}:${token}${part === undefined ? '' : `:${part}`}`;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Keeps a share; returns its token. */
export async function stageShare(
  userId: string,
  item: Omit<SharedItem, 'files' | 'at'>,
  files: Array<SharedFile & { data: Uint8Array }>,
): Promise<string> {
  const token = randomToken(18);
  const meta: SharedItem = {
    ...item,
    files: files.map(({ name, type, size }) => ({ name, type, size })),
    at: new Date().toISOString(),
  };
  const m = redis().multi();
  files.forEach((f, i) => m.set(key(userId, token, i), Buffer.from(f.data), 'EX', SHARE_TTL_S));
  m.set(key(userId, token), JSON.stringify(meta), 'EX', SHARE_TTL_S);
  await m.exec();
  return token;
}

function checkToken(token: string) {
  if (!TOKEN.test(token)) throw new ApiError(404, 'not_found');
}

export async function getShare(userId: string, token: string): Promise<SharedItem> {
  checkToken(token);
  const raw = await redis().get(key(userId, token));
  if (!raw) throw new ApiError(404, 'not_found');
  return JSON.parse(raw) as SharedItem;
}

export async function getSharedFile(
  userId: string,
  token: string,
  n: number,
): Promise<SharedFile & { data: Buffer }> {
  const meta = await getShare(userId, token);
  const f = meta.files[n];
  if (!f) throw new ApiError(404, 'not_found');
  const data = await redis().getBuffer(key(userId, token, n));
  if (!data) throw new ApiError(404, 'not_found');
  return { ...f, data };
}

export async function dropShare(userId: string, token: string) {
  checkToken(token);
  const raw = await redis().get(key(userId, token));
  const n = raw ? (JSON.parse(raw) as SharedItem).files.length : 0;
  await redis().del(key(userId, token), ...Array.from({ length: n }, (_, i) => key(userId, token, i)));
}
