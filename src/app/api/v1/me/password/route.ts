import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { requestMeta } from '@/server/auth/route-utils';
import { changePassword } from '@/server/account';

const Body = z.object({ current: z.string().min(1).max(256), next: z.string().min(1).max(256) });

// POST /me/password: current password required; other sessions end.
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const b = await body(req, Body);
  await changePassword(auth, b, requestMeta(req));
  return json({ ok: true });
});
