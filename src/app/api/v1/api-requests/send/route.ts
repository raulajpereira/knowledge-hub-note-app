import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { sendApiRequest } from '@/server/content/apiPlayground';
import { METHODS } from '../schemas';

/**
 * POST /api-requests/send { method, url, headers: [[k, v]], body? } — the
 * already-resolved request, made by the server with SSRF protection
 * (no private / loopback / metadata addresses, redirects not followed).
 */
export const POST = handler(async (req) => {
  const auth = await requireContent('api');
  if (!(await allow(`api-send:${auth.user.id}`, 60, 60))) throw new ApiError(429, 'too_many_requests');
  const input = await body(
    req,
    z.object({
      method: z.enum(METHODS),
      url: z.string().min(1).max(8000),
      headers: z.array(z.tuple([z.string().max(500), z.string().max(20_000)])).max(200),
      body: z.string().max(1_000_000).optional(),
    }),
  );
  return json(await sendApiRequest(auth, input));
});
