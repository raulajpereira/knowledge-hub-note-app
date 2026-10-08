import { body, clientIp, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { deleteUser, updateUser } from '@/server/admin/users';
import { UserPatchZ } from '../../schemas';

/** PATCH /users/:id — name, email, role in the client, status (Suporte may do it, D46). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('users', true);
  await updateUser(a, await idParam(ctx), await body(req, UserPatchZ), clientIp(req));
  return json({ ok: true });
});

/** DELETE /users/:id — "Eliminar utilizador" (and its data, for good): commercial roles only. */
export const DELETE = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('clients', true);
  await deleteUser(a, await idParam(ctx), clientIp(req));
  return json({ ok: true });
});
