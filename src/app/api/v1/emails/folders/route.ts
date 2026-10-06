import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createEmailFolder, listEmailFolders } from '@/server/content/emails';

export const GET = handler(async () => {
  const auth = await requireContent('emails');
  return json({ folders: await listEmailFolders(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('emails');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createEmailFolder(auth, name) }, { status: 201 });
});
