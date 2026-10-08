import { clientIp, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { inviteToClient } from '@/server/admin/tenants';

/** POST /clients/:id/invite — "+ Convidar utilizador": an invite code for the free seats. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('clients', true);
  return json({ code: await inviteToClient(a, await idParam(ctx), clientIp(req)) }, { status: 201 });
});
