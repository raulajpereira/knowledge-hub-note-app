import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { VaultView } from '@/components/vault/VaultView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Palavras-passe' };

export default async function PasswordsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([entitlementsFor(auth), getLang()]);
  if (!ent.modules.includes('passwords'))
    return (
      <Placeholder
        icon="passwords"
        title={translate(lang, 'nav_passwords')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return <VaultView />;
}
