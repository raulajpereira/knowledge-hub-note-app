import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { grantAdmin, listAdmins } from '@/server/admin/admins';
import { AdminRoleZ } from '../schemas';

/** GET /admins — the console's administrators (Manager only). */
export const GET = handler(async () => {
  await requireAdmin('admins');
  return json({ admins: await listAdmins() });
});

/** POST /admins {email, role} — "Dar acesso" to an existing account. */
export const POST = handler(async (req) => {
  const a = await requireAdmin('admins', true);
  const { email, role } = await body(req, z.object({ email: z.email().max(254), role: AdminRoleZ }).strict());
  await grantAdmin(a, email, role);
  return json({ ok: true }, { status: 201 });
});
