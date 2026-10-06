import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { readVoiceAudio } from '@/server/content/voice';

/** GET /voice/:id/audio — the recording, only to its owner (RLS). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('voice');
  const a = await readVoiceAudio(auth, await idParam(ctx));
  if (!a) throw new ApiError(404, 'not_found');
  return new NextResponse(Buffer.from(a.body), {
    headers: {
      'Content-Type': a.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});
