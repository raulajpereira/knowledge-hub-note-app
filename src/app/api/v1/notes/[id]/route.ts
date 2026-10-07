import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getNote, trashNote, updateNote } from '@/server/content/notes';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  return json({ note: await getNote(auth, await idParam(ctx)) });
});

/** content is TipTap JSON, validated server-side (allowlisted nodes/marks, safe URLs, ≤ 1 MB). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  const input = await body(
    req,
    z.object({
      title: z.string().max(300).optional(),
      content: z.unknown().optional(),
      tags: z.array(z.string().max(40)).max(30).optional(),
      favorite: z.boolean().optional(),
      folderId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ note: await updateNote(auth, await idParam(ctx), input) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  await trashNote(auth, await idParam(ctx));
  return json({ ok: true });
});
