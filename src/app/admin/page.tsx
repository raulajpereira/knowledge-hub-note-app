import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { adminOf } from '@/server/admin/guard';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getPrefs } from '@/server/prefs';
import { listAssets } from '@/server/assets';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Admin', robots: { index: false } };

// Admin Console (Admin Console.dc.html). Active console admins only — anyone
// else gets a 404 (the console isn't advertised); the API checks the role of
// every call again. Without 2FA the console asks for it first (SECURITY.md).
export default async function AdminPage() {
  const auth = await getAuth();
  if (!auth) redirect('/login?next=/admin');
  const admin = await adminOf(auth);
  if (!admin) notFound();
  const [ent, prefs, assets] = await Promise.all([
    getEntitlements(auth.tenant.id),
    getPrefs(auth.user.id),
    listAssets(auth.user.id),
  ]);
  return (
    <AdminShell
      me={{
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        role: admin.role,
        totp: auth.user.totpEnabled,
        assets,
        modules: ent.modules,
      }}
      prefs={prefs}
    />
  );
}
