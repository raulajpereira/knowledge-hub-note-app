import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashBoard, updateBoard } from '@/server/content/whiteboards';
import { WbDocSchema, type WbEl } from '@/lib/whiteboard';

const MAX = 4 * 1024 * 1024;
const Patch = z
  .object({
    name: z.string().trim().max(200).optional(),
    els: WbDocSchema.shape.els.optional(),
    base: z.iso.datetime().optional(),
    force: z.boolean().optional(),
  })
  .strict();

/** PUT /whiteboards/:id — save name and/or elements; 409 `conflict` when the board changed since `base`. */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('whiteboard');
  const id = await idParam(ctx);
  if (Number(req.headers.get('content-length') ?? 0) > MAX)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX });
  const p = await body(req, Patch);
  if (p.els) WbDocSchema.parse({ els: p.els }); // unique ids
  return json(await updateBoard(auth, id, { ...p, els: p.els as WbEl[] | undefined }));
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('whiteboard');
  await trashBoard(auth, await idParam(ctx));
  return json({ ok: true });
});
