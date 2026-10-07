import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import {
  createApiRequest,
  listApiEnvs,
  listApiFolders,
  listApiRequests,
} from '@/server/content/apiPlayground';

/** GET /api-requests — requests (with their decrypted auth), folders and environments. */
export const GET = handler(async () => {
  const auth = await requireContent('api');
  const [requests, folders, envs] = await Promise.all([
    listApiRequests(auth),
    listApiFolders(auth),
    listApiEnvs(auth),
  ]);
  return json({ requests, folders, envs });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('api');
  const input = await body(
    req,
    z.object({ title: z.string().trim().min(1).max(300), folderId: z.uuid().nullable().optional() }),
  );
  return json({ request: await createApiRequest(auth, input) }, { status: 201 });
});
