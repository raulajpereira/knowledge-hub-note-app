import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { Placeholder } from '@/components/shell/Placeholder';
import { TasksView } from '@/components/tasks/TasksView';

export const metadata = { title: 'KnowledgeHub · Tarefas' };

export default async function TasksPage() {
  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  if (!ent.modules.includes('tasks'))
    return (
      <Placeholder
        icon="tasks"
        title={translate(lang, 'nav_tasks')}
        body={translate(lang, 'soon_notInPlan')}
        muted
      />
    );
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}
