import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashSystem, updateSystem } from '@/server/content/sap';
import { SystemInput } from '../../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('systems');
  const id = await idParam(ctx);
  return json({ system: await updateSystem(auth, id, await body(req, SystemInput)) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('systems');
  await trashSystem(auth, await idParam(ctx));
  return json({ ok: true });
});
