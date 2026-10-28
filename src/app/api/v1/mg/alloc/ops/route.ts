import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { applyAlOps } from '@/server/content/mgAlloc';
import { AlOp } from '@/lib/alloc';

/**
 * POST /mg/alloc/ops { ops: [{ op: 'put', c: 'bk' | 'ab', v, base } | { op: 'del', c, id, base }] } —
 * one transaction; `base` = the version the change was made on ('' = new). 409 `conflict` when
 * someone changed one of them meanwhile (nothing applied). Returns { vers: { id: version } }.
 */
export const POST = handler(async (req) => {
  const auth = await requireAnyContent(MG_MODULES);
  const { ops } = await body(req, z.object({ ops: z.array(AlOp).min(1).max(2000) }));
  if (!(await allow(`mg-alloc-ops:${auth.user.id}`, 240, 60))) throw new ApiError(429, 'too_many_requests');
  return json({ vers: await applyAlOps(auth, ops) });
});
