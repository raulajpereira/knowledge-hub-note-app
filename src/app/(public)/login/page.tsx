import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Iniciar sessão' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await getAuth()) redirect('/app');
  const sp = await searchParams;
  return <LoginForm next={sp.next} focusForgot={sp.forgot === '1'} />;
}
