import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createDriveFolder } from '@/server/content/drive';

export const POST = handler(async (req) => {
  const auth = await requireContent('files');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createDriveFolder(auth, name) }, { status: 201 });
});
