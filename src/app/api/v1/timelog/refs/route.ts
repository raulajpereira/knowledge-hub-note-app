import { handler, json } from '@/server/http';
import { searchRefs } from '@/server/content/timelog';
import { timelogAuth } from '@/server/content/timelogHttp';

/** GET /timelog/refs?q= — tickets and project tasks for the "Ticket" field. */
export const GET = handler(async (req) => {
  const { auth, mods } = await timelogAuth();
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  return json({ refs: await searchRefs(auth, q, mods) });
});
