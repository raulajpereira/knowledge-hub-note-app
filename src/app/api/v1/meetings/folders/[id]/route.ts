import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteKindFolder, renameKindFolder } from '@/server/content/kindFolders';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  await renameKindFolder(auth, 'meetings', await idParam(ctx), name);
  return json({ ok: true });
});

/** The folder goes; its meetings stay (no folder). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  await deleteKindFolder(auth, 'meetings', await idParam(ctx));
  return json({ ok: true });
});
