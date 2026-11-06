import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { VoiceView } from '@/components/voice/VoiceView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Notas de Voz' };

export default async function VoicePage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([entitlementsFor(auth), getLang()]);
  if (!ent.modules.includes('voice'))
    return (
      <Placeholder
        icon="voice"
        title={translate(lang, 'nav_voice')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <VoiceView />
    </Suspense>
  );
}
