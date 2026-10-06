import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createVaultItem } from '@/server/content/vault';
import { Ciphertext } from '@/server/content/vaultSchemas';

export const POST = handler(async (req) => {
  const auth = await requireContent('passwords');
  const { ciphertext } = await body(req, z.object({ ciphertext: Ciphertext }));
  return json({ item: await createVaultItem(auth, ciphertext) }, { status: 201 });
});
