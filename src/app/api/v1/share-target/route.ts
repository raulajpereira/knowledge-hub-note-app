import type { NextRequest } from 'next/server';
import { assertSameOrigin } from '@/server/http';
import { getAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { sniffImage } from '@/server/assets';
import {
  SHARE_MAX_FILE,
  SHARE_MAX_FILES,
  SHARE_MAX_TOTAL,
  SHARE_TYPES,
  stageShare,
  type SharedFile,
} from '@/server/shareInbox';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** the bytes match the type the sender declared (no renamed executables in "image/png") */
function looksLike(type: string, b: Uint8Array): boolean {
  const ascii = (from: number, n: number) => String.fromCharCode(...b.subarray(from, from + n));
  if (type === 'application/pdf') return ascii(0, 5) === '%PDF-';
  if (type === 'image/gif') return ascii(0, 4) === 'GIF8';
  if (/^image\/(heic|heif|avif)$/.test(type)) return ascii(4, 4) === 'ftyp';
  return sniffImage(b) === type;
}

/**
 * POST /share-target — the PWA's Web Share Target (manifest `share_target`,
 * multipart: title, text, url, files[]). A browser navigation, so every
 * answer is a redirect: to /app/share to choose what to make of it, or to the
 * login. Nothing is created here; the shared content waits for an hour.
 */
export async function POST(req: NextRequest) {
  const go = (to: string) =>
    new Response(null, { status: 303, headers: { Location: `${BASE}${to}`, 'Cache-Control': 'no-store' } });
  const fail = (code: string) => go(`/app/share?e=${code}`);
  // the share sheet's POST comes without an Origin (or "null"); any other site's is refused
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null') {
    try {
      assertSameOrigin(req);
    } catch {
      return fail('invalid');
    }
  }
  const auth = await getAuth();
  if (!auth) return go(`/login?next=${encodeURIComponent('/app/share')}`);
  if (!(await allow(`share-in:${auth.user.id}`, 30, 600))) return fail('too_many');
  const len = Number(req.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(len)) return fail('invalid');
  if (len > SHARE_MAX_TOTAL + 256 * 1024) return fail('too_big');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('invalid');
  }
  const str = (k: string, max: number) => {
    const v = form.get(k);
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  };
  const title = str('title', 300);
  const text = str('text', 20_000);
  const url = str('url', 2048);
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > SHARE_MAX_FILES) return fail('too_many_files');
  let total = 0;
  const staged: Array<SharedFile & { data: Uint8Array }> = [];
  for (const f of files) {
    const type = f.type.toLowerCase();
    if (!SHARE_TYPES.test(type)) return fail('type');
    if (f.size > SHARE_MAX_FILE || (total += f.size) > SHARE_MAX_TOTAL) return fail('too_big');
    const data = new Uint8Array(await f.arrayBuffer());
    if (!looksLike(type, data)) return fail('type');
    const name = (f.name || 'ficheiro').replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200);
    staged.push({ name, type, size: data.length, data });
  }
  if (!title && !text && !url && !staged.length) return fail('empty');
  const token = await stageShare(
    auth.user.id,
    { title, text, url: /^https?:\/\/\S+$/i.test(url) ? url : '' },
    staged,
  );
  return go(`/app/share?k=${token}`);
}
