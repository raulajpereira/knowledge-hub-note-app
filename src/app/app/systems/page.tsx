import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { SystemsView } from '@/components/sap/SystemsView';

export const metadata = { title: 'KnowledgeHub · Sistemas SAP' };

export default async function SystemsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('systems'))
    return (
      <Placeholder
        icon="systems"
        title={translate(lang, 'nav_systems')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <SystemsView />
    </Suspense>
  );
}
