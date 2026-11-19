import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { HelpdeskView } from '@/components/helpdesk/HelpdeskView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Helpdesk' };

export default async function HelpdeskPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([entitlementsFor(auth), getLang()]);
  if (!ent.modules.includes('helpdesk') && !ent.modules.includes('tickets'))
    return (
      <Placeholder
        icon="helpdesk"
        title={translate(lang, 'nav_helpdesk')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <HelpdeskView />
    </Suspense>
  );
}
