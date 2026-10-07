import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { IssuesView } from '@/components/issues/IssuesView';

export const metadata = { title: 'KnowledgeHub · Tarefas de Projeto' };

export default async function IssuesPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('issues'))
    return (
      <Placeholder
        icon="issues"
        title={translate(lang, 'nav_issues')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <IssuesView />
    </Suspense>
  );
}
