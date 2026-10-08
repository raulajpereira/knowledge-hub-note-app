import type { NextRequest } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { fileResponse } from '@/server/fileResponse';
import { findLink, isUnlocked, publicDriveFile, unlockCookie } from '@/server/share/links';

type Ctx = { params: Promise<{ token: string }> };

/** GET /public/:token/raw — a publicly linked file (inline when previewable, ?dl=1 download). */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const { token } = await ctx.params;
  const f = await findLink(token);
  if (!f || !isUnlocked(f, req.cookies.get(unlockCookie(f))?.value)) throw new ApiError(404, 'not_found');
  const file = await publicDriveFile(f, req.headers.get('range'));
  if (!file) throw new ApiError(404, 'not_found');
  return fileResponse(file, { download: req.nextUrl.searchParams.has('dl'), publicLink: true });
});
