import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { CalendarView } from '@/components/calendar/CalendarView';
import { entitlementsFor } from '@/server/workspaces';

export const metadata = { title: 'KnowledgeHub · Calendário' };

export default async function CalendarPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([entitlementsFor(auth), getLang()]);
  if (!ent.modules.includes('calendar'))
    return (
      <Placeholder
        icon="calendar"
        title={translate(lang, 'nav_calendar')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return <CalendarView />;
}
