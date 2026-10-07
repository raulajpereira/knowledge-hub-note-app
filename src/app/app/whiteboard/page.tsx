import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { WhiteboardView } from '@/components/whiteboard/WhiteboardView';

export const metadata = { title: 'KnowledgeHub · Quadro' };

export default async function WhiteboardPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('whiteboard'))
    return (
      <Placeholder
        icon="whiteboard"
        title={translate(lang, 'nav_whiteboard')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <WhiteboardView />
    </Suspense>
  );
}
