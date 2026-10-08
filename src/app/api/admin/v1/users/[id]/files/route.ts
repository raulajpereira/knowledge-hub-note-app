import { body, clientIp, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { setFileLimits } from '@/server/admin/users';
import { FileLimitsZ } from '../../../schemas';

/** PATCH /users/:id/files — Ficheiros quota and largest file (commercial roles: it is part of the package). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('clients', true);
  await setFileLimits(a, await idParam(ctx), await body(req, FileLimitsZ), clientIp(req));
  return json({ ok: true });
});
