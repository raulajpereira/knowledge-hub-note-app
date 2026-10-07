import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashApiRequest, updateApiRequest } from '@/server/content/apiPlayground';
import { RequestPatch } from '../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  const patch = await body(req, RequestPatch);
  return json({ request: await updateApiRequest(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  await trashApiRequest(auth, await idParam(ctx));
  return json({ ok: true });
});
