import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { updateNote } from '@/server/content/notes';

/** POST /notes/:id/move { folderId } (API.md). */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  const { folderId } = await body(req, z.object({ folderId: z.uuid().nullable() }));
  return json({ note: await updateNote(auth, await idParam(ctx), { folderId }) });
});
