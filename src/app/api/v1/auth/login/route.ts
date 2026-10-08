import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { login } from '@/server/auth/service';
import { requestMeta, setSessionCookie } from '@/server/auth/route-utils';

const Body = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(256),
  remember: z.boolean().default(false),
  captcha: z.string().max(4096).optional(),
});

export const POST = handler(async (req) => {
  const b = await body(req, Body);
  const result = await login(b, requestMeta(req));
  if (result.kind === 'two_factor') return json({ ok: true, twoFactor: true, challenge: result.challenge });
  const res = json({ ok: true });
  setSessionCookie(res, result.token, result.remember);
  return res;
});
