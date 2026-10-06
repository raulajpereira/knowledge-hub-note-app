import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth, requireRecentReauth } from '@/server/auth/request';
import { enableTotp } from '@/server/auth/service';

const Body = z.object({ code: z.string().trim().min(6).max(8) });

export const POST = handler(async (req) => {
  const auth = await requireAuth();
  requireRecentReauth(auth);
  const b = await body(req, Body);
  return json(await enableTotp(auth, b.code));
});
