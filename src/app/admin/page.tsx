import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins } from '@/db/schema';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { AmbientBackground } from '@/components/ui';
import { Placeholder } from '@/components/shell/Placeholder';
import '@/components/shell/shell.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Admin' };

// Admin Console (Phase 10). Until then: active admins see a placeholder,
// everyone else a 404 (the console's existence isn't advertised).
export default async function AdminPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [a] = await db().select().from(admins).where(eq(admins.userId, auth.user.id)).limit(1);
  if (!a || a.status !== 'active') notFound();
  const lang = await getLang();
  return (
    <>
      <AmbientBackground />
      <main
        className="kh-above"
        style={{ height: '100vh', display: 'flex', padding: 20, boxSizing: 'border-box' }}
      >
        <Placeholder
          icon="mg_overview"
          title={translate(lang, 'shell_adminLbl')}
          body={translate(lang, 'soon_body')}
        />
      </main>
    </>
  );
}
