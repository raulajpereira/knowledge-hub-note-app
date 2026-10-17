import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { idParam, type IdCtx } from '@/server/content/guard';
import { openExport } from '@/server/dataExport';

/** GET /me/exports/:id/download — the ZIP, only to its owner while signed in (streamed from the bucket). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireAuth();
  const f = await openExport(auth, await idParam(ctx));
  return new NextResponse(f.stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(f.size),
      'Content-Disposition': `attachment; filename="${f.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
