import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteApiEnv, updateApiEnv } from '@/server/content/apiPlayground';
import { Kv } from '../../api-requests/schemas';

/** PUT /api-envs/:id { vars?, name? } — variables are stored encrypted. */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  const patch = await body(
    req,
    z.object({ vars: z.array(Kv).max(200).optional(), name: z.string().trim().min(1).max(40).optional() }),
  );
  return json({ env: await updateApiEnv(auth, await idParam(ctx), patch) });
});

/** DELETE /api-envs/:id — each folder (and the global list) keeps at least one. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  await deleteApiEnv(auth, await idParam(ctx));
  return json({ ok: true });
});
