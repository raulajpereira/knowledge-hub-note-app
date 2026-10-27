import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { globalSearch } from '@/server/search/global';
import { DROPDOWN_PER_GROUP, MAX_PER_GROUP } from '@/lib/search/global';
import { MAX_QUERY } from '@/lib/search/fold';

const Params = z.object({
  q: z.string().max(1000).default(''),
  type: z
    .string()
    .regex(/^[a-z_]{1,30}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PER_GROUP).default(DROPDOWN_PER_GROUP),
});

// GET /search?q=&type=&limit= — the header's global search (as the person types:
// one request per pause in typing). Every module of the plan, or only `type`.
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const sp = new URL(req.url).searchParams;
  const p = Params.parse({
    q: sp.get('q') ?? undefined,
    type: sp.get('type') ?? undefined,
    limit: sp.get('limit') ?? undefined,
  });
  // typing sends a few requests a second: a generous cap, only against floods
  if (!(await allow(`search:${auth.user.id}`, 600, 60))) throw new ApiError(429, 'too_many_requests');
  const { modules } = await getEntitlements(auth.tenant.id);
  return json(
    await globalSearch(auth, p.q.slice(0, MAX_QUERY), { modules, perGroup: p.limit, type: p.type }),
  );
});
