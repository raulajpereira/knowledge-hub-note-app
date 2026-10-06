import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, modules } from '@/db/schema';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { AppHome } from './AppHome';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub' };

// Phase 2 landing after sign-in; the real shell (sidebar, dashboard)
// replaces it in Phase 3.
export default async function AppPage() {
  const auth = await getAuth();
  if (!auth) redirect('/login?next=/app');
  const [ent, mods, admin, lang] = await Promise.all([
    getEntitlements(auth.tenant.id),
    db().select().from(modules).orderBy(modules.sort),
    db().select({ role: admins.role }).from(admins).where(eq(admins.userId, auth.user.id)).limit(1),
    getLang(),
  ]);
  const included = mods
    .filter((m) => ent.modules.includes(m.id))
    .map((m) => (lang === 'en' ? m.labelEn : m.labelPt));
  return (
    <AppHome
      name={auth.user.name}
      tenant={auth.tenant.name}
      plan={auth.tenant.planCode ?? '—'}
      modules={included}
      isAdmin={Boolean(admin[0])}
    />
  );
}
