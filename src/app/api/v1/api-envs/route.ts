import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createApiEnv, listApiEnvs } from '@/server/content/apiPlayground';

/** GET /api-envs — the global environments and each folder's own (missing ones are created). */
export const GET = handler(async () => {
  const auth = await requireContent('api');
  return json({ envs: await listApiEnvs(auth) });
});

/** POST /api-envs { name, folderId } — a new environment in a folder (null: global). */
export const POST = handler(async (req) => {
  const auth = await requireContent('api');
  const input = await body(
    req,
    z.object({ name: z.string().trim().min(1).max(40), folderId: z.uuid().nullable() }),
  );
  return json({ env: await createApiEnv(auth, input) }, { status: 201 });
});
