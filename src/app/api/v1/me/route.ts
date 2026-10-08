import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { admins } from '@/db/schema';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getPrefs } from '@/server/prefs';
import { deleteAccount, updateProfile } from '@/server/account';
import { clientIp } from '@/server/http';
import { clearSessionCookie } from '@/server/auth/route-utils';

// GET /me → user, tenant, plan, entitlements, prefs (API.md). The UI gates
// the sidebar with `entitlements.modules`; the server re-checks on every call.
export const GET = handler(async () => {
  const auth = await requireAuth();
  const [ent, admin, prefs] = await Promise.all([
    getEntitlements(auth.tenant.id),
    db()
      .select({ role: admins.role, status: admins.status })
      .from(admins)
      .where(eq(admins.userId, auth.user.id))
      .limit(1),
    getPrefs(auth.user.id),
  ]);
  return json({
    user: auth.user,
    tenant: auth.tenant,
    entitlements: ent,
    admin: admin[0]?.status === 'active' ? { role: admin[0].role } : null,
    prefs,
  });
});

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  lang: z.enum(['pt', 'en']).optional(),
});

/** PATCH /me { name?, lang? } */
export const PATCH = handler(async (req) => {
  const auth = await requireAuth();
  await updateProfile(auth, await body(req, Patch));
  return json({ ok: true });
});

/** DELETE /me → delete the account and its data (RGPD); needs a recent password check. */
export const DELETE = handler(async (req) => {
  const auth = await requireAuth();
  await deleteAccount(auth, { ip: clientIp(req) });
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
