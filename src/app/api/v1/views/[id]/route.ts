import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { idParam, type IdCtx } from '@/server/content/guard';
import { deleteView, updateView } from '@/server/content/views';

/** PATCH /views/:id { name?, filter? } (the filter is validated for the view's kind) */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireAuth();
  const input = await body(
    req,
    z.object({ name: z.string().trim().min(1).max(60).optional(), filter: z.unknown().optional() }),
  );
  await updateView(auth, await idParam(ctx), input);
  return json({ ok: true });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireAuth();
  await deleteView(auth, await idParam(ctx));
  return json({ ok: true });
});
