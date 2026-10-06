import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteEmailFolder } from '@/server/content/emails';

/** DELETE /emails/folders/:id — the emails stay, without a folder. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  await deleteEmailFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
