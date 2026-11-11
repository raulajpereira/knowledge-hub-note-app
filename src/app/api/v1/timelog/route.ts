import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { addManual, listEntries, TimeManual } from '@/server/content/timelog';
import { timelogAuth, tzOf } from '@/server/content/timelogHttp';

/** GET /timelog?from=&to= — the entries started in the range (newest first). */
export const GET = handler(async (req) => {
  const { auth } = await timelogAuth();
  const sp = new URL(req.url).searchParams;
  const p = z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).safeParse({
    from: sp.get('from'),
    to: sp.get('to'),
  });
  if (!p.success) throw new ApiError(400, 'invalid_range');
  const from = new Date(p.data.from);
  const to = new Date(p.data.to);
  if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new ApiError(400, 'invalid_range');
  return json({ entries: await listEntries(auth, from, to) });
});

/** POST /timelog — "Registo manual" { …fields, startedAt, endedAt } */
export const POST = handler(async (req) => {
  const input = await body(req, TimeManual);
  const { auth, mods } = await timelogAuth();
  return json({ entry: await addManual(auth, input, mods, tzOf(req)) }, { status: 201 });
});
