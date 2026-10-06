import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { VaultView } from '@/components/vault/VaultView';

export const metadata = { title: 'KnowledgeHub · Palavras-passe' };

export default async function PasswordsPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
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
