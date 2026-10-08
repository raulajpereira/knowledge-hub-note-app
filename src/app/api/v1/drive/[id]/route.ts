import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashDriveFile, updateDriveFile } from '@/server/content/drive';

/** PATCH /drive/:id { name?, folderId?, sharedFolderId? } — rename or move. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  const patch = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(255).optional(),
      folderId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ file: await updateDriveFile(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  await trashDriveFile(auth, await idParam(ctx));
  return json({ ok: true });
});
