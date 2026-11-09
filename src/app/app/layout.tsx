import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, users } from '@/db/schema';
import { getAuth } from '@/server/auth/request';
import { cookies } from 'next/headers';
import { SIZE_COOKIE, withDeviceSize } from '@/lib/deviceSize';
import { listAssets } from '@/server/assets';
import { AppShell } from '@/components/shell/AppShell';
import type { ShellMe } from '@/components/shell/types';
import { prefsFor, entitlementsFor } from '@/server/workspaces';
import { getEntitlements } from '@/server/licensing/entitlements';

const COMBINED_FEATURES = new Set(['brand', 'bgphoto', 'typeface', 'glass', 'accent', 'sidebar']);

export const dynamic = 'force-dynamic';

// Signed-in area: session, entitlements, admin role and prefs are resolved
// on the server for every navigation; the client only renders them.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect('/login?next=/app');
  const [ent, plan, admin, { prefs, ws }, u, assets] = await Promise.all([
    entitlementsFor(auth),
    getEntitlements(auth.tenant.id),
    db()
      .select({ role: admins.role, status: admins.status })
      .from(admins)
      .where(eq(admins.userId, auth.user.id))
      .limit(1),
    prefsFor(auth),
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
      status: auth.tenant.status,
    },
    // the combined view: only the Calendar (the Home is always there) and the features with no items
    modules: auth.combined
      ? ent.modules.filter((m) => m === 'calendar' || COMBINED_FEATURES.has(m))
      : ent.modules,
    admin: admin[0]?.status === 'active' ? { role: admin[0].role } : null,
    assets,
    workspaces: {
      list: ws.list,
      active: ws.active.id,
      planModules: plan.modules,
      device: auth.combined ? 'all' : (auth.workspaceId ?? null),
      combined: !!auth.combined,
    },
  };
  return (
    <AppShell me={me} prefs={withDeviceSize(prefs, (await cookies()).get(SIZE_COOKIE)?.value)}>
      {children}
    </AppShell>
  );
}
