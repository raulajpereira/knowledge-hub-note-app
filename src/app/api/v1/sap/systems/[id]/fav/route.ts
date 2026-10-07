import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { setSystemFav } from '@/server/content/sap';

/** PUT /sap/systems/:id/fav — the user's own favourite (Início › Acesso Rápido SAP). */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('systems');
  const { fav } = await body(req, z.object({ fav: z.boolean() }));
  await setSystemFav(auth, await idParam(ctx), fav);
  return json({ ok: true });
});
