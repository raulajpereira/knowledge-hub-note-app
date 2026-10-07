import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { ArtifactsView } from '@/components/artifacts/ArtifactsView';

export const metadata = { title: 'KnowledgeHub · Artefactos' };

export default async function ArtifactsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('artifacts'))
    return (
      <Placeholder
        icon="artifacts"
        title={translate(lang, 'nav_artifacts')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <ArtifactsView />
    </Suspense>
  );
}
