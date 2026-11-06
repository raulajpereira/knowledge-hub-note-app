import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { activityOf } from '@/server/activity';
import { entitlementsFor } from '@/server/workspaces';
import { ApiError } from '@/server/errors';

const Q = z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) });

/** GET /me/activity?from=…&to=… — created / completed / changed items in [from, to) (at most 93 days). */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) throw new ApiError(400, 'invalid_input');
  const from = new Date(p.data.from);
  const to = new Date(p.data.to);
  if (!(to > from) || to.getTime() - from.getTime() > 93 * 86_400_000)
    throw new ApiError(400, 'invalid_input');
  const { modules } = await entitlementsFor(auth);
  return json({ items: await activityOf(auth, { from, to }, new Set(modules)) });
});
