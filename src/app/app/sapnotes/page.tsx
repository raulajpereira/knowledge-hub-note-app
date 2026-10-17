import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { SapNotesView } from '@/components/sap/SapNotesView';

export const metadata = { title: 'KnowledgeHub · Notas SAP' };

export default async function SapNotesPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('sapnotes'))
    return (
      <Placeholder
        icon="sapnotes"
        title={translate(lang, 'nav_sapnotes')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <SapNotesView />
    </Suspense>
  );
}
