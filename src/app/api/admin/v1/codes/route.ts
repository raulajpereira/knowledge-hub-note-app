import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { generateCode, listCodes } from '@/server/admin/codes';
import { NewCode } from '../schemas';

/** GET /codes — every code (revoked ones while they can be restored). */
export const GET = handler(async () => {
  await requireAdmin('codes');
  return json({ codes: await listCodes() });
});

/** POST /codes — "Gerar código" (KH-INV/KH-LIC-######, random and unique). */
export const POST = handler(async (req) => {
  const a = await requireAdmin('codes', true);
  const c = await generateCode(a, await body(req, NewCode));
  return json({ code: c.code }, { status: 201 });
});
