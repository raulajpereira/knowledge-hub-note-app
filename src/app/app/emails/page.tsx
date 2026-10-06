import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { EmailsView } from '@/components/emails/EmailsView';

export const metadata = { title: 'KnowledgeHub · Emails' };

export default async function EmailsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('emails'))
    return (
      <Placeholder
        icon="emails"
        title={translate(lang, 'nav_emails')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <EmailsView />
    </Suspense>
  );
}
