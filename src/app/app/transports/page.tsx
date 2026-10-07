import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TransportsView } from '@/components/sap/TransportsView';

export const metadata = { title: 'KnowledgeHub · Ordens de Transporte' };

export default async function TransportsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('transports'))
    return (
      <Placeholder
        icon="transports"
        title={translate(lang, 'nav_transports')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <TransportsView />
    </Suspense>
  );
}
