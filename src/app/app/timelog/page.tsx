import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TimelogView } from '@/components/timelog/TimelogView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Registo de Tempos' };

export default async function TimelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang, sp] = await Promise.all([entitlementsFor(auth), getLang(), searchParams]);
  if (!ent.modules.includes('timelog'))
    return (
      <Placeholder
        icon="timelog"
        title={translate(lang, 'nav_timelog')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  // with Helpdesk the time log is its "Registo de Tempos" tab
  if (ent.modules.includes('helpdesk')) {
    const e = typeof sp.e === 'string' ? sp.e : '';
    redirect(`/app/helpdesk?tab=time${e ? `&e=${encodeURIComponent(e)}` : ''}`);
  }
  return (
    <Suspense>
      <TimelogView />
    </Suspense>
  );
}
