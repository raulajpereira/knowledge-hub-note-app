import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TrashView } from '@/components/trash/TrashView';

export const metadata = { title: 'KnowledgeHub · Lixo' };

export default async function TrashPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('notes'))
    return (
      <Placeholder
        icon="notes"
        title={translate(lang, 'nav_trash')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return <TrashView />;
}
