import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { getPrefs } from '@/server/prefs';
import { DEFAULT_NEWS_SOURCES, tickerFor } from '@/server/news/ticker';

// Footer ticker items for the user's enabled RSS sources (prefs.newsSources,
// prototype defaults until they're edited in Definições › Notícias).
export const GET = handler(async () => {
  const auth = await requireAuth();
  if (!(await allow(`ticker:${auth.user.id}`, 30, 60))) throw new ApiError(429, 'too_many_requests');
  const prefs = await getPrefs(auth.user.id);
  return json(await tickerFor(prefs.newsSources ?? DEFAULT_NEWS_SOURCES));
});
