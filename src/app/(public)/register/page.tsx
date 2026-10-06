import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Criar conta' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await getAuth()) redirect('/app');
  const sp = await searchParams;
  return <RegisterForm initialCode={sp.code} />;
}
