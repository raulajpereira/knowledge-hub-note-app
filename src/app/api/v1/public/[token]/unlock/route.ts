import { z } from 'zod';
import { body, clientIp, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { env } from '@/lib/env';
import { checkPassword, findLink, unlockCookie, unlockProof } from '@/server/share/links';

type Ctx = { params: Promise<{ token: string }> };

/** POST /public/:token/unlock {password} — sets the cookie that opens a password-protected link (12 h). */
export const POST = handler(async (req, ctx: Ctx) => {
  const { token } = await ctx.params;
  const { password } = await body(req, z.object({ password: z.string().min(1).max(200) }).strict());
  const ip = clientIp(req) ?? 'unknown';
  if (
    !(await allow(`pl-unlock:${ip}`, 20, 600)) ||
    !(await allow(`pl-unlock:${token.slice(0, 16)}`, 30, 600))
  )
    throw new ApiError(429, 'too_many_requests');
  const f = await findLink(token);
  if (!f) throw new ApiError(404, 'not_found');
  if (!f.password_hash) return json({ ok: true });
  if (!(await checkPassword(f, password))) throw new ApiError(401, 'invalid_password');
  const res = json({ ok: true });
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  res.cookies.set(unlockCookie(f), unlockProof(f), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
    path: `${base}/`,
    maxAge: 12 * 3600,
  });
  return res;
});
