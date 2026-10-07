import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashObject, updateObject } from '@/server/content/codelib';
import { ObjectPatch } from '../../schemas';

/** PATCH with `base` (the updatedAt edited from): 409 conflict when someone else saved meanwhile, unless `force`. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('codelib');
  const id = await idParam(ctx);
  return json({ object: await updateObject(auth, id, await body(req, ObjectPatch)) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('codelib');
  await trashObject(auth, await idParam(ctx));
  return json({ ok: true });
});
