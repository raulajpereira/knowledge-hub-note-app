import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { ApiView } from '@/components/apiplay/ApiView';

export const metadata = { title: 'KnowledgeHub · API Playground' };

export default async function ApiPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('api'))
    return (
      <Placeholder
        icon="api"
        title={translate(lang, 'nav_api')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <ApiView />
    </Suspense>
  );
}
