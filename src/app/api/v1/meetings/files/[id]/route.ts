import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { readMeetingFile } from '@/server/content/meetings';

/** GET /meetings/files/:id — an image inside one of the caller's meeting records (RLS: owner only). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  const f = await readMeetingFile(auth, await idParam(ctx));
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
