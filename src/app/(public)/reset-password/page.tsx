import { inspectResetToken } from '@/server/auth/service';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KnowledgeHub · Definir nova password', robots: { index: false } };

// Opened from the recovery (or first-access) email. The token is checked on
// the server so an invalid / used / expired link shows its state right away.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams).token ?? '';
  const info = token ? await inspectResetToken(token) : null;
  return <ResetForm token={token} email={info?.email ?? null} setup={info?.setup ?? false} />;
}
