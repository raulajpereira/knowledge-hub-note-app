import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { SearchView } from '@/components/search/SearchView';

export const metadata = { title: 'KnowledgeHub · Pesquisa' };

// The global search's full results (Enter in the header box). Every plan has
// it; the API searches only the plan's modules.
export default async function SearchPage() {
  if (!(await getAuth())) notFound();
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
