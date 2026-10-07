import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { FunctionalView } from '@/components/sap/FunctionalView';

export const metadata = { title: 'KnowledgeHub · Funcional SAP' };

export default async function FnPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('fn_test'))
    return (
      <Placeholder
        icon="fn_test"
        title={translate(lang, 'nav_fn_test')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <FunctionalView page="fn_test" />
    </Suspense>
  );
}
