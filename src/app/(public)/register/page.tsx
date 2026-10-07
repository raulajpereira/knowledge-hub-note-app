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
  // the email of a shared-folder invitation (Partilha): /register?invite=1&email=
  const invitedEmail = sp.invite === '1' && sp.email ? sp.email.slice(0, 254) : undefined;
  return <RegisterForm initialCode={sp.code} invitedEmail={invitedEmail} />;
}
