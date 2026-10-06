import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { reauthenticate } from '@/server/auth/service';
import { requestMeta } from '@/server/auth/route-utils';

const Body = z.object({ password: z.string().min(1).max(256) });

// Lock screen: unlocking re-checks the password on the server (SECURITY.md §2).
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const b = await body(req, Body);
  await reauthenticate(auth, b.password, requestMeta(req));
  return json({ ok: true });
});
