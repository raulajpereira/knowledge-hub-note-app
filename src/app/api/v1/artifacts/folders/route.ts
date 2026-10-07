import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createArtifactFolder } from '@/server/content/artifacts';

export const POST = handler(async (req) => {
  const auth = await requireContent('artifacts');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createArtifactFolder(auth, name) }, { status: 201 });
});
