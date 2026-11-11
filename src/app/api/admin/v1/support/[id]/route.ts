import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { idParam, type IdCtx } from '@/server/content/guard';
import { setReportStatus } from '@/server/support';

/** PATCH /support/:id { status: 'new' | 'done' } */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const { status } = await body(req, z.object({ status: z.enum(['new', 'done']) }));
  const actx = await requireAdmin('requests', true);
  await setReportStatus(actx, await idParam(ctx), status);
  return json({ ok: true });
});
