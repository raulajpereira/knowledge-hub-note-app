import { z } from 'zod';
import { body, clientIp, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { quickAction } from '@/server/admin/tenants';

/** POST /tenants/:id/action {action} — "Precisa de atenção": reminder, convert, +5 seats, invoice. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('clients', true);
  const { action } = await body(
    req,
    z.object({ action: z.enum(['reminder', 'convert', 'seats5', 'invoice']) }).strict(),
  );
  await quickAction(a, await idParam(ctx), action, clientIp(req));
  return json({ ok: true });
});
