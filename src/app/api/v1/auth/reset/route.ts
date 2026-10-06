import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { resetPassword } from '@/server/auth/service';
import { requestMeta, clearSessionCookie } from '@/server/auth/route-utils';
import { MAX_PASSWORD } from '@/lib/passwordStrength';

const Body = z.object({ token: z.string().min(10).max(100), password: z.string().min(1).max(MAX_PASSWORD) });

export const POST = handler(async (req) => {
  const b = await body(req, Body);
  await resetPassword(b, requestMeta(req));
  const res = json({ ok: true });
  clearSessionCookie(res); // every session ends, including this browser's
  return res;
});
