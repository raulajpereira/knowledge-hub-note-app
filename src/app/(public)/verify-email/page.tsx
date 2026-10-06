import { VerifyEmail } from './VerifyEmail';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Confirmar email', robots: { index: false } };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <VerifyEmail token={(await searchParams).token ?? ''} />;
}
