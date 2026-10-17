import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { reorderViews } from '@/server/content/views';

/** POST /views/order { ids } — the new order of the caller's views */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).max(50) }));
  await reorderViews(auth, ids);
  return json({ ok: true });
});
