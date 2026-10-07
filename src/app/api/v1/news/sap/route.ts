import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { getPrefs } from '@/server/prefs';
import { DEFAULT_SAP_NEWS_SOURCES } from '@/lib/news';
import { sapNewsFor } from '@/server/news/sap';

// SAP News page: the articles of the user's enabled feeds (prefs.sapNewsSources,
// prototype defaults until edited). ?refresh=1 skips the 30-min cache.
export const GET = handler(async (req) => {
  const auth = await requireContent('news');
  const fresh = new URL(req.url).searchParams.get('refresh') === '1';
  if (!(await allow(`sapnews:${auth.user.id}`, fresh ? 6 : 30, 60)))
    throw new ApiError(429, 'too_many_requests');
  const prefs = await getPrefs(auth.user.id);
  return json(await sapNewsFor(prefs.sapNewsSources ?? DEFAULT_SAP_NEWS_SOURCES, fresh));
});
