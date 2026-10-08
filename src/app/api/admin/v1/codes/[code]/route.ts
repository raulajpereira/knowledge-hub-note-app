import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { codeUsers, editCode } from '@/server/admin/codes';
import { codeParam, EditCode, type CodeCtx } from '../../schemas';

/** GET /codes/:code — who registered with it ("Utilizado por"). */
export const GET = handler(async (_req, ctx: CodeCtx) => {
  await requireAdmin('codes');
  return json({ users: await codeUsers(await codeParam(ctx)) });
});

/** PATCH /codes/:code {maxUses, expiresAt} — "Guardar". */
export const PATCH = handler(async (req, ctx: CodeCtx) => {
  const a = await requireAdmin('codes', true);
  await editCode(a, await codeParam(ctx), await body(req, EditCode));
  return json({ ok: true });
});
