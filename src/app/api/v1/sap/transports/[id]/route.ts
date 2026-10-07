import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashTransport, updateTransport } from '@/server/content/transports';
import { TransportInput } from '../../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('transports');
  const id = await idParam(ctx);
  return json({ transport: await updateTransport(auth, id, await body(req, TransportInput)) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('transports');
  await trashTransport(auth, await idParam(ctx));
  return json({ ok: true });
});
