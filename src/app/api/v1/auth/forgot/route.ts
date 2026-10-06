import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { forgotPassword } from '@/server/auth/service';
import { requestMeta } from '@/server/auth/route-utils';

const Body = z.object({ email: z.email().max(254) });

// Generic answer whether or not the account exists (SECURITY.md §2).
export const POST = handler(async (req) => {
  const b = await body(req, Body);
  await forgotPassword(b.email, requestMeta(req));
  return json({ ok: true });
});
