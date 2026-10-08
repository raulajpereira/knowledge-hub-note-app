import { NextResponse } from 'next/server';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, MG_MODULES, requireAnyContent, requireContent, type IdCtx } from '@/server/content/guard';
import { PHOTO_MAX, deletePersonPhoto, putPersonPhoto, readPersonPhoto } from '@/server/content/mgPhoto';

/** GET /mg/people/:id/photo?v=<version> — versioned URL, so cacheable. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireAnyContent(MG_MODULES);
  const p = await readPersonPhoto(auth, await idParam(ctx));
  return new NextResponse(Buffer.from(p.body), {
    headers: {
      'Content-Type': p.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});

/** PUT /mg/people/:id/photo — raw image body (PNG/JPEG/WebP, ≤ 1 MB); replaces the previous one. */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('mg_people');
  if (!(await allow(`mgphoto:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > PHOTO_MAX)
    throw new ApiError(413, 'file_too_large', undefined, { max: PHOTO_MAX });
  const v = await putPersonPhoto(auth, await idParam(ctx), new Uint8Array(await req.arrayBuffer()));
  return json({ photo: v });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('mg_people');
  await deletePersonPhoto(auth, await idParam(ctx));
  return json({ ok: true });
});
