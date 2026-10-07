import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { NewsView } from '@/components/news/NewsView';

export const metadata = { title: 'KnowledgeHub · SAP News' };

export default async function NewsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('news'))
    return <Placeholder icon="notes" title="SAP News" body={translate(lang, 'soon_notInPlan')} muted />;
  return <NewsView />;
}
