import { handler, json } from '@/server/http';
import { timeOptions } from '@/server/content/timelog';
import { timelogAuth } from '@/server/content/timelogHttp';

/** GET /timelog/options — clients, projects, recent entries, and whether a timesheet person exists. */
export const GET = handler(async () => {
  const { auth, mods } = await timelogAuth();
  return json(await timeOptions(auth, mods));
});
