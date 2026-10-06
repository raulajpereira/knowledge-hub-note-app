import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getEmail, trashEmail, updateEmail } from '@/server/content/emails';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  return json({ email: await getEmail(auth, await idParam(ctx)) });
});

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  const patch = await body(
    req,
    z.object({
      folderId: z.uuid().nullable().optional(),
      starred: z.boolean().optional(),
      pinned: z.boolean().optional(),
      notes: z.string().max(20_000).optional(),
    }),
  );
  return json({ email: await updateEmail(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  await trashEmail(auth, await idParam(ctx));
  return json({ ok: true });
});
