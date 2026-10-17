import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { indexStatus, reindex } from '@/server/search/status';

/** GET /ai/index — semantic search / OCR status of the caller's items. */
export const GET = handler(async () => {
  const auth = await requireContent('ai');
  return json({ status: await indexStatus(auth) });
});

/** POST /ai/index — "Reindexar": everything again, in the background (twice an hour at most). */
export const POST = handler(async () => {
  const auth = await requireContent('ai');
  if (!(await allow(`aireindex:${auth.user.id}`, 2, 3600))) throw new ApiError(429, 'too_many_requests');
  const queued = await reindex(auth);
  return json({ queued, status: await indexStatus(auth) });
});
