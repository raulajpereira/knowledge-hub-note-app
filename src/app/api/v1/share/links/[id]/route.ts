import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { revokeLink, updateLink } from '@/server/share/links';

const Patch = z
  .object({
    expiresOn: z.iso.date().nullable(),
    password: z.string().max(200).nullable(),
  })
  .partial()
  .strict();

/** PATCH /share/links/:id {expiresOn?, password?} — '' or null clears the password. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  const p = await body(req, Patch);
  return json({ link: await updateLink(auth, await idParam(ctx), p) });
});

/** DELETE /share/links/:id — "Remover partilha": the link stops working for good. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  await revokeLink(auth, await idParam(ctx));
  return json({ ok: true });
});
