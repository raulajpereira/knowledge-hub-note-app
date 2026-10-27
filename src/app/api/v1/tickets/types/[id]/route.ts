import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteType, renameType } from '@/server/content/tickets';
import { TypeName } from '../../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const { name } = await body(req, TypeName);
  await renameType(auth, await idParam(ctx), name);
  return json({ ok: true });
});

/** The type goes; its tickets stay (without a type). The last type can't go. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  await deleteType(auth, await idParam(ctx));
  return json({ ok: true });
});
