import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';

export const metadata = { title: 'KnowledgeHub' };

function greetingKey(hour: number) {
  return hour < 12 ? 'h_morning' : hour < 20 ? 'h_afternoon' : 'h_evening';
}

// Início. The widget dashboard (Phase 3.3) replaces this placeholder.
export default async function HomePage() {
  const [auth, lang] = await Promise.all([getAuth(), getLang()]);
  const first = auth?.user.name.split(/\s+/)[0] ?? '';
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Lisbon' }).format(
      new Date(),
    ),
  );
  return (
    <Placeholder
      icon="home"
      title={`${translate(lang, greetingKey(hour))}, ${first}`}
      body={translate(lang, 'soon_home')}
    />
  );
}
