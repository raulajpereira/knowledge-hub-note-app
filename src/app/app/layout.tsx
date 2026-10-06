import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, users } from '@/db/schema';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getPrefs } from '@/server/prefs';
import { listAssets } from '@/server/assets';
import { AppShell } from '@/components/shell/AppShell';
import type { ShellMe } from '@/components/shell/types';

export const dynamic = 'force-dynamic';

// Signed-in area: session, entitlements, admin role and prefs are resolved
// on the server for every navigation; the client only renders them.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect('/login?next=/app');
  const [ent, admin, prefs, u, assets] = await Promise.all([
    getEntitlements(auth.tenant.id),
    db()
      .select({ role: admins.role, status: admins.status })
      .from(admins)
      .where(eq(admins.userId, auth.user.id))
      .limit(1),
    getPrefs(auth.user.id),
    db().select({ createdAt: users.createdAt }).from(users).where(eq(users.id, auth.user.id)).limit(1),
    listAssets(auth.user.id),
  ]);
  const me: ShellMe = {
    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      totpEnabled: auth.user.totpEnabled,
      createdAt: (u[0]?.createdAt ?? new Date()).toISOString(),
    },
    tenant: {
      name: auth.tenant.name,
      planCode: auth.tenant.planCode,
      renewAt: auth.tenant.renewAt?.toISOString() ?? null,
      trialEndsAt: auth.tenant.trialEndsAt?.toISOString() ?? null,
    },
    modules: ent.modules,
    admin: admin[0]?.status === 'active' ? { role: admin[0].role } : null,
    assets,
  };
  return (
    <AppShell me={me} prefs={prefs}>
      {children}
    </AppShell>
  );
}
