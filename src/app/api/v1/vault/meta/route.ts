import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { saveVaultMeta } from '@/server/content/vault';
import { Ciphertext } from '@/server/content/vaultSchemas';

/** PUT /vault/meta — encrypted folder list. */
export const PUT = handler(async (req) => {
  const auth = await requireContent('passwords');
  const { metaCt } = await body(req, z.object({ metaCt: Ciphertext }));
  await saveVaultMeta(auth, metaCt);
  return json({ ok: true });
});
