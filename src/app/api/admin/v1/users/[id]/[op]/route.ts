import { z } from 'zod';
import { clientIp, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { resendInvite, sendUserReset } from '@/server/admin/users';

type Ctx = { params: Promise<{ id: string; op: string }> };

/** POST /users/:id/{reset|resend} — "Repor password" / "Reenviar convite". */
export const POST = handler(async (req, ctx: Ctx) => {
  const a = await requireAdmin('users', true);
  const p = await ctx.params;
  const id = z.uuid().parse(p.id);
  const op = z.enum(['reset', 'resend']).parse(p.op);
  await (op === 'reset' ? sendUserReset : resendInvite)(a, id, clientIp(req));
  return json({ ok: true });
});
