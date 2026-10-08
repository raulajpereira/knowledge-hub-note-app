import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { AI_PROVIDER_IDS } from '@/lib/ai';
import { aiModels } from '@/server/ai/settings';

/** POST /ai/models { provider, apiKey? } — tests the key and lists its models. */
export const POST = handler(async (req) => {
  const auth = await requireContent('ai');
  if (!(await allow(`aimodels:${auth.user.id}`, 20, 600))) throw new ApiError(429, 'too_many_requests');
  const { provider, apiKey } = await body(
    req,
    z.object({ provider: z.enum(AI_PROVIDER_IDS), apiKey: z.string().trim().max(400).optional() }).strict(),
  );
  return json({ models: await aiModels(auth, provider, apiKey) });
});
