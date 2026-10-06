import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { verifyEmail } from '@/server/auth/service';

const Body = z.object({ token: z.string().min(10).max(100) });

export const POST = handler(async (req) => {
  const b = await body(req, Body);
  if (!(await verifyEmail(b.token))) throw new ApiError(400, 'token_invalid');
  return json({ ok: true });
});
