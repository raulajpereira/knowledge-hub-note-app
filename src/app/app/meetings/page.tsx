import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { MeetingsView } from '@/components/meetings/MeetingsView';

export const metadata = { title: 'KnowledgeHub · Registos Reuniões' };

export default async function MeetingsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('meetings'))
    return (
      <Placeholder
        icon="meetings"
        title={translate(lang, 'nav_meetings')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <MeetingsView />
    </Suspense>
  );
}
