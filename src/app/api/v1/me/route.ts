import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins } from '@/db/schema';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';

// GET /me → user, tenant, plan, entitlements (API.md). The UI gates the
// sidebar with `entitlements.modules`; the server re-checks on every call.
export const GET = handler(async () => {
  const auth = await requireAuth();
  const [ent, admin] = await Promise.all([
    getEntitlements(auth.tenant.id),
    db()
      .select({ role: admins.role, status: admins.status })
      .from(admins)
      .where(eq(admins.userId, auth.user.id))
      .limit(1),
  ]);
  return json({
    user: auth.user,
    tenant: auth.tenant,
    entitlements: ent,
    admin: admin[0]?.status === 'active' ? { role: admin[0].role } : null,
  });
});
