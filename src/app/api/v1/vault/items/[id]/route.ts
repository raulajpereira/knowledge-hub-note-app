import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteVaultItem, updateVaultItem } from '@/server/content/vault';
import { Ciphertext } from '@/server/content/vaultSchemas';

/** PUT { ciphertext, version } — 409 version_conflict with the current item if it changed elsewhere. */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('passwords');
  const { ciphertext, version } = await body(
    req,
    z.object({ ciphertext: Ciphertext, version: z.number().int().min(1) }),
  );
  return json({ item: await updateVaultItem(auth, await idParam(ctx), ciphertext, version) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('passwords');
  await deleteVaultItem(auth, await idParam(ctx));
  return json({ ok: true });
});
