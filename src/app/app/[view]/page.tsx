import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { idFromSegment, isKnownItem, moduleOf } from '@/components/shell/nav';
import { Placeholder } from '@/components/shell/Placeholder';

// Every module of a later phase answers with a placeholder, but only when
// the plan includes it — the gate is enforced here, on the server.
const EXTRA_VIEWS: Record<string, { module: string | null; label: string; icon: string }> = {
  trash: { module: 'notes', label: 'nav_trash', icon: 'notes' },
};

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const id = idFromSegment(view);
  const extra = EXTRA_VIEWS[id];
  if (!extra && (!isKnownItem(id) || id === 'home')) notFound();

  const auth = await getAuth();
  if (!auth) notFound();
  const [ent, lang] = await Promise.all([getEntitlements(auth.tenant.id), getLang()]);
  const mod = extra ? extra.module : moduleOf(id);
  const allowed = mod === null || ent.modules.includes(mod);
  const title = extra ? translate(lang, extra.label) : translate(lang, `nav_${id}`);

  return (
    <Placeholder
      icon={extra?.icon ?? id}
      title={title}
      body={translate(lang, allowed ? 'soon_body' : 'soon_notInPlan')}
      muted={!allowed}
    />
  );
}
