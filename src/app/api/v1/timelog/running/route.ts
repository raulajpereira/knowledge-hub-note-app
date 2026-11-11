import { handler, json } from '@/server/http';
import { runningEntry } from '@/server/content/timelog';
import { timelogAuth } from '@/server/content/timelogHttp';

/** GET /timelog/running — the entry being timed, or null (the header button). */
export const GET = handler(async () => {
  const { auth } = await timelogAuth();
  return json({ entry: await runningEntry(auth) });
});
