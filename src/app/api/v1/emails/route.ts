import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listEmailFolders, listEmails } from '@/server/content/emails';

/** GET /emails — the list (no bodies) and the folders. */
export const GET = handler(async () => {
  const auth = await requireContent('emails');
  const [emails, folders] = await Promise.all([listEmails(auth), listEmailFolders(auth)]);
  return json({ emails, folders });
});
