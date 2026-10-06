import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireAuth } from '@/server/auth/request';
import { idParam, type IdCtx } from '@/server/content/guard';
import { readFile } from '@/server/content/notes';

/** GET /files/:id — an image inside one of the caller's notes (RLS: owner only). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireAuth();
  const f = await readFile(auth, await idParam(ctx));
  if (!f) throw new ApiError(404, 'not_found');
  return new NextResponse(Buffer.from(f.body), {
    headers: {
      'Content-Type': f.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});
