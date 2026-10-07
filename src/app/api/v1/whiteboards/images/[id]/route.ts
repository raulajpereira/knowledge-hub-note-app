import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { readBoardImage } from '@/server/content/whiteboards';

/** GET /whiteboards/images/:id — an image placed on one of the caller's boards (RLS: owner only). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('whiteboard');
  const f = await readBoardImage(auth, await idParam(ctx));
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
