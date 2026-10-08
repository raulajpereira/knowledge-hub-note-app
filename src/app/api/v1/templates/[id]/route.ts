import { handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAuth } from '@/server/auth/request';
import { deleteTemplate } from '@/server/content/templates';

/** DELETE /templates/:id — one of the caller's own templates. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireAuth();
  await deleteTemplate(auth, await idParam(ctx));
  return json({ ok: true });
});
