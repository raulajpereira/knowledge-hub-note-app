import { NextResponse, type NextRequest } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { findLink, isUnlocked, publicArtifactHtml, unlockCookie } from '@/server/share/links';

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /public/:token/view — a publicly linked artifact on its own, with
 * `CSP: sandbox` (opaque origin: its scripts can't reach the app).
 */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const { token } = await ctx.params;
  const f = await findLink(token);
  if (!f || !isUnlocked(f, req.cookies.get(unlockCookie(f))?.value)) throw new ApiError(404, 'not_found');
  const html = await publicArtifactHtml(f);
  if (html === null) throw new ApiError(404, 'not_found');
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "sandbox allow-scripts allow-popups allow-forms allow-modals; frame-ancestors 'self'",
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
});
