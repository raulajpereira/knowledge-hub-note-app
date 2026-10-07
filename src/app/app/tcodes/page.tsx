import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TcodesView } from '@/components/sap/TcodesView';

export const metadata = { title: 'KnowledgeHub · SAP TCodes' };

export default async function TcodesPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('tcodes'))
    return (
      <Placeholder
        icon="tcodes"
        title={translate(lang, 'nav_tcodes')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <TcodesView />
    </Suspense>
  );
}
