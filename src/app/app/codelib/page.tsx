import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { CodelibView } from '@/components/sap/CodelibView';

export const metadata = { title: 'KnowledgeHub · Biblioteca de Código SAP' };

export default async function CodelibPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('codelib'))
    return (
      <Placeholder
        icon="codelib"
        title={translate(lang, 'nav_codelib')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <CodelibView />
    </Suspense>
  );
}
