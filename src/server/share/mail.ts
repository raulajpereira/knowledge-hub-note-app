import 'server-only';
import { env } from '@/lib/env';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import type { ShareKind } from '@/db/schema';

const KIND = {
  pt: { notes: 'notas', tasks: 'tarefas', artifacts: 'artefactos', files: 'ficheiros' },
  en: { notes: 'notes', tasks: 'tasks', artifacts: 'artifacts', files: 'files' },
} as const;

/** Tells a member a folder was shared with them, or invites an email without an account to sign up. */
export async function notifyShared(p: {
  to: string;
  lang: 'pt' | 'en';
  who: string;
  folder: string;
  kind: ShareKind;
  hasAccount: boolean;
}) {
  const base = env().APP_URL.replace(/\/$/, '');
  const link = p.hasAccount ? `${base}/app` : `${base}/register?invite=1&email=${encodeURIComponent(p.to)}`;
  const vars = { who: p.who.slice(0, 80), folder: p.folder.slice(0, 80), kind: KIND[p.lang][p.kind] };
  await sendMail(renderMail(p.hasAccount ? 'shared' : 'shareInvite', p.lang, p.to, link, vars)).catch(
    () => {},
  );
}
