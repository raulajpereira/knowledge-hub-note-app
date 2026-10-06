import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { trashItems } from '@/server/content/guard';
import { purgeTrash } from '@/server/content/notes';

/** POST /trash/purge { all: true } | { items } — permanent. */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const input = await body(req, z.union([z.object({ all: z.literal(true) }), trashItems]));
  await purgeTrash(auth, 'all' in input ? 'all' : input.items);
  return json({ ok: true });
});
