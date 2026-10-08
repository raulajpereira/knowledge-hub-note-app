import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { artifactHtml } from '@/server/content/artifacts';
import { withAppScrollbars } from '@/lib/scrollbars';

/**
 * GET /artifacts/:id/view — "Abrir num Novo Separador". The response carries
 * `CSP: sandbox` without allow-same-origin: the page runs with an opaque
 * origin, so its scripts can't read the app's cookies, storage or API.
 */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  const a = await artifactHtml(auth, await idParam(ctx));
  if (!a) throw new ApiError(404, 'not_found');
  return new NextResponse(withAppScrollbars(a.html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "sandbox allow-scripts allow-popups allow-forms allow-modals; frame-ancestors 'self'",
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
