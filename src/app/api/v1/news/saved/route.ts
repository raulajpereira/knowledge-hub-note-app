import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listSaved, SavedInput, saveItem, unsaveItem } from '@/server/news/saved';

/** "Guardadas para mais tarde": GET the list · POST an article · DELETE { link } (marcar como lida). */
export const GET = handler(async () => {
  const auth = await requireContent('news');
  return json({ items: await listSaved(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('news');
  await saveItem(auth, await body(req, SavedInput));
  return json({ ok: true }, { status: 201 });
});

export const DELETE = handler(async (req) => {
  const auth = await requireContent('news');
  const { link } = await body(req, z.object({ link: z.string().max(2000) }));
  await unsaveItem(auth, link);
  return json({ ok: true });
});
