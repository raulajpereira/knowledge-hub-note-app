import { z } from 'zod';
import { handler } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getSharedFile } from '@/server/shareInbox';

type Ctx = { params: Promise<{ token: string; n: string }> };

/** GET /share-target/:token/:n — the bytes of a shared file (always a download; the page reads it as a blob) */
export const GET = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  const { token, n } = await ctx.params;
  const f = await getSharedFile(auth.user.id, token, z.coerce.number().int().min(0).max(50).parse(n));
  return new Response(new Uint8Array(f.data), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(f.data.length),
      'Content-Disposition': 'attachment',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
