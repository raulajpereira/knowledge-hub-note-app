import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listTags, renameTag } from '@/server/content/notes';

// GET /tags — labels used in the caller's notes with their counts · PATCH { from, to } renames one.
export const GET = handler(async () => {
  const auth = await requireContent('notes');
  return json({ tags: await listTags(auth) });
});

export const PATCH = handler(async (req) => {
  const auth = await requireContent('notes');
  const { from, to } = await body(
    req,
    z.object({ from: z.string().min(1).max(40), to: z.string().trim().min(1).max(40) }),
  );
  return json(await renameTag(auth, from, to));
});
