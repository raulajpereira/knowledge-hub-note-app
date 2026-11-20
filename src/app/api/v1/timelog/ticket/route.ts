import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { ticketEntries } from '@/server/content/timelog';
import { timelogAuth } from '@/server/content/timelogHttp';

/** GET /timelog/ticket?n=&id= — one ticket's entries (by its number; a manual ticket also by its id). */
export const GET = handler(async (req) => {
  const { auth } = await timelogAuth();
  const sp = new URL(req.url).searchParams;
  const p = z
    .object({ n: z.string().trim().max(40).regex(/^#?[A-Za-z0-9_.-]*$/), id: z.uuid().nullable() })
    .safeParse({ n: sp.get('n') ?? '', id: sp.get('id') });
  if (!p.success) throw new ApiError(400, 'invalid_ticket');
  return json({ entries: await ticketEntries(auth, { number: p.data.n, ticketId: p.data.id }) });
});
