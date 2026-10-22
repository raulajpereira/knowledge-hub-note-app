import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { ShareTargetView } from '@/components/shareTarget/ShareTargetView';

export const metadata = { title: 'KnowledgeHub · Partilhar' };

/** Where Android's share sheet lands (manifest share_target → POST /api/v1/share-target → here). */
export default async function SharePage() {
  const auth = await getAuth();
  if (!auth) notFound();
  return (
    <Suspense>
      <ShareTargetView />
    </Suspense>
  );
}
