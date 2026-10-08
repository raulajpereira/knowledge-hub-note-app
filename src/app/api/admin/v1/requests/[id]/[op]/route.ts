import { z } from 'zod';
import { clientIp, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { approveRequest, rejectRequest } from '@/server/plans/requests';

type Ctx = { params: Promise<{ id: string; op: string }> };

/** POST /requests/:id/{approve|reject} [{reason}] — approving applies the plan to the client. */
export const POST = handler(async (req, ctx: Ctx) => {
  const a = await requireAdmin('requests', true);
  const p = await ctx.params;
  const id = z.uuid().parse(p.id);
  const op = z.enum(['approve', 'reject']).parse(p.op);
  if (op === 'approve') await approveRequest(a, id, clientIp(req));
  else {
    const { reason } = z
      .object({ reason: z.string().max(500).default('') })
      .parse(await req.json().catch(() => ({})));
    await rejectRequest(a, id, reason, clientIp(req));
  }
  return json({ ok: true });
});
