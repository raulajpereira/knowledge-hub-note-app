import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashTcode, updateTcode } from '@/server/content/sap';
import { TcodeInput } from '../../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tcodes');
  const id = await idParam(ctx);
  return json({ tcode: await updateTcode(auth, id, await body(req, TcodeInput)) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tcodes');
  await trashTcode(auth, await idParam(ctx));
  return json({ ok: true });
});
