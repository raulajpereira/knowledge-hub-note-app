import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { renameFolder, trashFolder } from '@/server/content/notes';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  await renameFolder(auth, await idParam(ctx), name);
  return json({ ok: true });
});

/** Sends the notebook and its notes to the Trash. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  await trashFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
