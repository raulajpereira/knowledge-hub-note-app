import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createApiFolder } from '@/server/content/apiPlayground';

export const POST = handler(async (req) => {
  const auth = await requireContent('api');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createApiFolder(auth, name) }, { status: 201 });
});
