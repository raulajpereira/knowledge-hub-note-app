import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { trashItems } from '@/server/content/guard';
import { restoreTrash } from '@/server/content/notes';

export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const { items } = await body(req, trashItems);
  await restoreTrash(auth, items);
  return json({ ok: true });
});
