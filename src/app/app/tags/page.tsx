import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TagsView } from '@/components/tags/TagsView';

export const metadata = { title: 'KnowledgeHub · Etiquetas' };

export default async function TagsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('notes'))
    return (
      <Placeholder
        icon="tags"
        title={translate(lang, 'nav_tags')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return <TagsView />;
}
