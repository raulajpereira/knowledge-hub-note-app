import { NextResponse } from 'next/server';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { getEntitlements } from '@/server/licensing/entitlements';
import { assetLimit, deleteAsset, isAssetKind, putAsset, readAsset } from '@/server/assets';

type Ctx = { params: Promise<{ kind: string }> };

async function kindOf(ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isAssetKind(kind)) throw new ApiError(404, 'not_found');
  return kind;
}

/** GET /me/assets/:kind?v=<updatedAt> — the owner's image; versioned URL, so cacheable. */
export const GET = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  const kind = await kindOf(ctx);
  const a = await readAsset(auth.user.id, kind);
  if (!a) throw new ApiError(404, 'not_found');
  return new NextResponse(Buffer.from(a.body), {
    headers: {
      'Content-Type': a.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Last-Modified': a.updatedAt.toUTCString(),
    },
  });
});

/** PUT /me/assets/:kind — raw image body (PNG/JPEG/WebP). Replaces the previous one. */
export const PUT = handler(async (req, ctx: Ctx) => {
  const auth = await requireAuth();
  const kind = await kindOf(ctx);
  if (!(await allow(`asset:${auth.user.id}`, 20, 600))) throw new ApiError(429, 'too_many_requests');
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > assetLimit(kind))
    throw new ApiError(413, 'file_too_large', undefined, { max: assetLimit(kind) });
  const data = new Uint8Array(await req.arrayBuffer());
  const { modules } = await getEntitlements(auth.tenant.id);
  const v = await putAsset(auth, kind, data, new Set(modules));
  return json({ kind, v });
});

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  await deleteAsset(auth, await kindOf(ctx));
  return json({ ok: true });
});
