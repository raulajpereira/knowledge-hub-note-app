import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createKindFolder } from '@/server/content/kindFolders';

export const POST = handler(async (req) => {
  const auth = await requireContent('tickets');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createKindFolder(auth, 'tickets', name) }, { status: 201 });
});
