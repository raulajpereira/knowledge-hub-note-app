import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteApiFolder } from '@/server/content/apiPlayground';

/** DELETE /api-requests/folders/:id — the requests stay, without a folder. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  await deleteApiFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
