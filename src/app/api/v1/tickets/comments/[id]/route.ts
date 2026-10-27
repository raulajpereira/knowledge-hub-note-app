import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteComment } from '@/server/content/tickets';

/** DELETE /tickets/comments/:id — one's own comment. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  await deleteComment(auth, await idParam(ctx));
  return json({ ok: true });
});
