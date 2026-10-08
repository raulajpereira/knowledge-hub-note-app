import { handler, json } from '@/server/http';
import { requireAdmin, ROLE_ACCESS } from '@/server/admin/guard';

/** GET /me — the admin's role and what it can see / change (the console hides the rest). */
export const GET = handler(async () => {
  const ctx = await requireAdmin('overview');
  return json({ role: ctx.admin.role, access: ROLE_ACCESS[ctx.admin.role] });
});
