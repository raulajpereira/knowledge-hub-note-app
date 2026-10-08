import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteDriveFolder, renameDriveFolder } from '@/server/content/drive';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  await renameDriveFolder(auth, await idParam(ctx), name);
  return json({ ok: true });
});

/** The folder goes; its files stay ("Sem pasta"). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  await deleteDriveFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
