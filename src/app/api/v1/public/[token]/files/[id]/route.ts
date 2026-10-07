import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { findLink, isUnlocked, publicFile, unlockCookie } from '@/server/share/links';

type Ctx = { params: Promise<{ token: string; id: string }> };

/** GET /public/:token/files/:id — an image of the publicly linked note. */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const { token, id } = await ctx.params;
  const f = await findLink(token);
  if (!f || !z.uuid().safeParse(id).success || !isUnlocked(f, req.cookies.get(unlockCookie(f))?.value))
    throw new ApiError(404, 'not_found');
  const file = await publicFile(f, id);
  if (!file) throw new ApiError(404, 'not_found');
  return new NextResponse(Buffer.from(file.body), {
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'X-Robots-Tag': 'noindex',
    },
  });
});
