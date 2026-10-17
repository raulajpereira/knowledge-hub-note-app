import { NextResponse } from 'next/server';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteEvidence, isImage, readEvidence } from '@/server/content/fnEvidence';

/** GET /sap/functional/evidence/:id — the file (images inline, anything else as a download). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('fn_test');
  const f = await readEvidence(auth, await idParam(ctx));
  if (!f) throw new ApiError(404, 'not_found');
  const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const inline = isImage(f.mime);
  return new NextResponse(Buffer.from(f.body), {
    headers: {
      'Content-Type': inline ? f.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('fn_test');
  await deleteEvidence(auth, await idParam(ctx));
  return json({ ok: true });
});
