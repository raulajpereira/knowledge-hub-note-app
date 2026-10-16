import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteApiFolder, moveApiFolder } from '@/server/content/apiPlayground';

/**
 * PATCH /api-requests/folders/:id — move: under parentId (null: the top
 * level) at position among its siblings. Answers with every folder, renumbered.
 */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  const id = await idParam(ctx);
  const to = await body(
    req,
    z.object({ parentId: z.uuid().nullable(), position: z.number().int().min(0).max(1000) }),
  );
  return json({ folders: await moveApiFolder(auth, id, to) });
});

/**
 * DELETE /api-requests/folders/:id — its subfolders and requests move up to
 * its parent (requests of a top-level folder: no folder); its environments go.
 */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  await deleteApiFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
