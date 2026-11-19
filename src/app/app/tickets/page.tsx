import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TicketsView } from '@/components/tickets/TicketsView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Tickets' };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang, sp] = await Promise.all([entitlementsFor(auth), getLang(), searchParams]);
  // tickets now live in Helpdesk › Manuais (links to a ticket follow); this page
  // stays for its folders and sharing (?folders=1)
  if (ent.modules.includes('helpdesk') && ent.modules.includes('tickets') && !sp.folders) {
    const k = typeof sp.k === 'string' ? sp.k : '';
    redirect(`/app/helpdesk?tab=manual${k ? `&k=${encodeURIComponent(k)}` : ''}`);
  }
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
