import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteSharedFolder, updateSharedFolder } from '@/server/share/folders';
import { FolderPatch } from '../../schemas';

/** PATCH /share/folders/:id {name?, paused?} — owner only (RLS). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  await updateSharedFolder(auth, await idParam(ctx), await body(req, FolderPatch));
  return json({ ok: true });
});

/** DELETE /share/folders/:id — "Eliminar pasta": sharing ends, items stay with their owners. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  await deleteSharedFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
