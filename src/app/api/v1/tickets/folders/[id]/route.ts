import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteKindFolder, renameKindFolder } from '@/server/content/kindFolders';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  await renameKindFolder(auth, 'tickets', await idParam(ctx), name);
  return json({ ok: true });
});

/** The folder goes (and its sharing); its tickets stay (no folder). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  await deleteKindFolder(auth, 'tickets', await idParam(ctx));
  return json({ ok: true });
});
