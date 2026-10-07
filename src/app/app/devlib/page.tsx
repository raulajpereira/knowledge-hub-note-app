import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { DevLibView } from '@/components/devlib/DevLibView';

export const metadata = { title: 'KnowledgeHub · Biblioteca de Código' };

export default async function DevLibPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('devlib'))
    return (
      <Placeholder
        icon="devlib"
        title={translate(lang, 'nav_devlib')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <DevLibView />
    </Suspense>
  );
}
