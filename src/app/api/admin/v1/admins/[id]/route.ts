import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { removeAdmin, updateAdmin } from '@/server/admin/admins';
import { AdminRoleZ } from '../../schemas';

/** PATCH /admins/:userId {role?, status?} — "Mudar papel", "Pausar" / "Retomar". */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('admins', true);
  const patch = await body(
    req,
    z
      .object({ role: AdminRoleZ, status: z.enum(['active', 'paused']) })
      .partial()
      .strict(),
  );
  await updateAdmin(a, await idParam(ctx), patch);
  return json({ ok: true });
});

/** DELETE /admins/:userId — "Remover" the console access (the account stays). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const a = await requireAdmin('admins', true);
  await removeAdmin(a, await idParam(ctx));
  return json({ ok: true });
});
