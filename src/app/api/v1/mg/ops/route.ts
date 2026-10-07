import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { applyMgOps } from '@/server/content/mg';
import { MgOp } from '@/lib/mg';

/** POST /mg/ops { ops: [{ op: 'put', c, v } | { op: 'del', c, id }] } — applied in order, in one transaction. */
export const POST = handler(async (req) => {
  const auth = await requireAnyContent(MG_MODULES);
  const { ops } = await body(req, z.object({ ops: z.array(MgOp).min(1).max(5000) }));
  await applyMgOps(auth, ops);
  return json({ ok: true });
});
