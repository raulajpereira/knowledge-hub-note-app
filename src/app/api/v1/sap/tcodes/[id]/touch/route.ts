import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { touchTcode } from '@/server/content/sap';

/** POST /sap/tcodes/:id/touch — { fav } toggles the user's favourite, { use } counts a pick in the popup. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tcodes');
  const what = await body(
    req,
    z.object({ fav: z.boolean().optional(), use: z.literal(true).optional() }).strict(),
  );
  await touchTcode(auth, await idParam(ctx), what);
  return json({ ok: true });
});
