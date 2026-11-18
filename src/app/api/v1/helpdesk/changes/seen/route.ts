import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { markSeen } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/changes/seen — { ids } or { all: true }. */
export const POST = handler(async (req) => {
  const input = await body(
    req,
    z.union([z.object({ ids: z.array(z.uuid()).min(1).max(500) }), z.object({ all: z.literal(true) })]),
  );
  const auth = await helpdeskAuth();
  await markSeen(auth, 'ids' in input ? input.ids : 'all');
  return json({ ok: true });
});
