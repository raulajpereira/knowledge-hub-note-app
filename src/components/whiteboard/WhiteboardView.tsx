'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { useConfirm, useToast } from '@/components/ui';
import { itemHref } from '@/components/content/Connections';
import type { LinkType } from '@/lib/whiteboard';
import { Whiteboard } from './Whiteboard';

/** Hooks (i18n, dialogs, navigation) for the class-based board. */
export function WhiteboardView() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const go = (type: LinkType, id: string) =>
    router.push(type === 'snippet' ? `/app/devlib?s=${id}` : itemHref(type, id));
  return <Whiteboard t={t} confirm={confirm} toast={toast} go={go} />;
}
