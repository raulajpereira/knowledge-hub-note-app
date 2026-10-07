import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getArtifact, trashArtifact, updateArtifact } from '@/server/content/artifacts';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  return json({ artifact: await getArtifact(auth, await idParam(ctx)) });
});

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  const patch = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(300).optional(),
      description: z.string().max(2000).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
      pinned: z.boolean().optional(),
      folderId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ artifact: await updateArtifact(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  await trashArtifact(auth, await idParam(ctx));
  return json({ ok: true });
});
