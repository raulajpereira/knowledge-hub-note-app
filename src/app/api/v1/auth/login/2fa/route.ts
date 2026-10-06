import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { completeTwoFactor } from '@/server/auth/service';
import { requestMeta, setSessionCookie } from '@/server/auth/route-utils';

const Body = z.object({ challenge: z.string().min(10).max(100), code: z.string().trim().min(6).max(20) });

export const POST = handler(async (req) => {
  const b = await body(req, Body);
  const s = await completeTwoFactor(b, requestMeta(req));
  const res = json({ ok: true });
  setSessionCookie(res, s.token, s.remember);
  return res;
});
