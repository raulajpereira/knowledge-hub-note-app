import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createApiFolder } from '@/server/content/apiPlayground';

/** POST /api-requests/folders — a folder at the end of the top level, or of parentId's subfolders. */
export const POST = handler(async (req) => {
  const auth = await requireContent('api');
  const { name, parentId } = await body(
    req,
    z.object({ name: z.string().trim().min(1).max(80), parentId: z.uuid().nullable().optional() }),
  );
  return json({ folder: await createApiFolder(auth, name, parentId ?? null) }, { status: 201 });
});
