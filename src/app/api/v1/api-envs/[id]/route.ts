import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { updateApiEnv } from '@/server/content/apiPlayground';
import { Kv } from '../../api-requests/schemas';

/** PUT /api-envs/:id { vars } — stored encrypted. */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  const { vars } = await body(req, z.object({ vars: z.array(Kv).max(200) }));
  return json({ env: await updateApiEnv(auth, await idParam(ctx), vars) });
});
