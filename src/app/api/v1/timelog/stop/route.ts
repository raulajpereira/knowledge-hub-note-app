import { body, handler, json } from '@/server/http';
import { stopEntry, TimeStop } from '@/server/content/timelog';
import { timelogAuth, tzOf } from '@/server/content/timelogHttp';

/** POST /timelog/stop { description?, inTimesheet?, next? } — ends the running entry (and starts the next one). */
export const POST = handler(async (req) => {
  const input = await body(req, TimeStop);
  const { auth, mods } = await timelogAuth();
  return json(await stopEntry(auth, input, mods, tzOf(req)));
});
