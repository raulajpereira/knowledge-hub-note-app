import { NextResponse } from 'next/server';
import { handler } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { DOMAIN_RE, favicon } from '@/server/favicon';

/**
 * GET /favicon?domain=help.sap.com — the site's icon, fetched by our server.
 * No icon → 204 (the image fails quietly and the UI shows a letter; a 404
 * would be logged as an error in the browser console on every page).
 */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const domain = req.nextUrl.searchParams.get('domain') ?? '';
  if (!DOMAIN_RE.test(domain)) throw new ApiError(400, 'invalid_input');
  if (!(await allow(`fav:${auth.user.id}`, 120, 600))) throw new ApiError(429, 'too_many_requests');
  const icon = await favicon(domain);
  if (!icon)
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, max-age=86400' } });
  return new NextResponse(new Uint8Array(icon.body), {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'private, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});
