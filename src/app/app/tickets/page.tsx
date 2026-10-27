import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TicketsView } from '@/components/tickets/TicketsView';

export const metadata = { title: 'KnowledgeHub · Tickets' };

export default async function TicketsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('tickets'))
    return (
      <Placeholder
        icon="tickets"
        title={translate(lang, 'nav_tickets')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <TicketsView />
    </Suspense>
  );
}
