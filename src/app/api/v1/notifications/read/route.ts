import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { markRead } from '@/server/notify/service';

/** POST /notifications/read { ids: [...] } | { all: true } */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const input = await body(
    req,
    z.union([z.object({ ids: z.array(z.uuid()).min(1).max(200) }), z.object({ all: z.literal(true) })]),
  );
  return json({ unreadCount: await markRead(auth, input) });
});
