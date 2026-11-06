import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { FunctionalView } from '@/components/sap/FunctionalView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Funcional SAP' };

export default async function FnPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([entitlementsFor(auth), getLang()]);
  if (!ent.modules.includes('fn_proc'))
    return (
      <Placeholder
        icon="fn_proc"
        title={translate(lang, 'nav_fn_proc')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <FunctionalView page="fn_proc" />
    </Suspense>
  );
}
