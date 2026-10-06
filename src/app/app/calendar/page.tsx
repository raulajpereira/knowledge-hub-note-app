import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { CalendarView } from '@/components/calendar/CalendarView';

export const metadata = { title: 'KnowledgeHub · Calendário' };

export default async function CalendarPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
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
