import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { listTrash, TRASH_DAYS } from '@/server/content/notes';

export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ items: await listTrash(auth), days: TRASH_DAYS });
});
