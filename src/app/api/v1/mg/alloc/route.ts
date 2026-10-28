import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { loadAlloc } from '@/server/content/mgAlloc';

const Q = z.object({ from: z.iso.date(), to: z.iso.date() });

/** GET /mg/alloc?from=&to= — the manager's allocations and absences overlapping the range (at most 4 years). */
export const GET = handler(async (req) => {
  const auth = await requireAnyContent(MG_MODULES);
  const q = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) throw new ApiError(400, 'invalid_input', 'from/to');
  if (!(await allow(`mg-alloc:${auth.user.id}`, 300, 60))) throw new ApiError(429, 'too_many_requests');
  return json(await loadAlloc(auth, q.data.from, q.data.to));
});
