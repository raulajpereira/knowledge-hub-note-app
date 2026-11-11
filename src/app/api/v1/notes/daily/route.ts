import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { dailyInfo, openDaily } from '@/server/content/daily';
import { entitlementsFor } from '@/server/workspaces';
import { getLang } from '@/i18n/server';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /notes/daily?day=YYYY-MM-DD — the day's meetings, pending tasks and its note (if made). */
export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const p = Day.safeParse(new URL(req.url).searchParams.get('day'));
  if (!p.success) throw new ApiError(400, 'invalid_day');
  const { modules } = await entitlementsFor(auth);
  return json(await dailyInfo(auth, p.data, new Set(modules)));
});

/** POST /notes/daily { day } — the day's note (made now, in "Diário", when there is none). */
export const POST = handler(async (req) => {
  const { day } = await body(req, z.object({ day: Day }));
  const auth = await requireContent('notes');
  const { modules } = await entitlementsFor(auth);
  return json(await openDaily(auth, day, new Set(modules), await getLang()));
});
