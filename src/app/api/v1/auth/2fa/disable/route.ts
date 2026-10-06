import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { disableTotp } from '@/server/auth/service';

const Body = z.object({ password: z.string().min(1).max(256), code: z.string().trim().min(6).max(8) });

export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const b = await body(req, Body);
  await disableTotp(auth, b.password, b.code);
  return json({ ok: true });
});
