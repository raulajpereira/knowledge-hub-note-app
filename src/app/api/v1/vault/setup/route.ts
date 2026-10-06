import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { setupVault } from '@/server/content/vault';
import { Fingerprint, KdfParams, Salt, Wrapped } from '@/server/content/vaultSchemas';

export const POST = handler(async (req) => {
  const auth = await requireContent('passwords');
  const input = await body(
    req,
    z.object({
      kdfSalt: Salt,
      kdfParams: KdfParams,
      dekWrappedMp: Wrapped,
      dekWrappedRk: Wrapped,
      rkFingerprint: Fingerprint,
    }),
  );
  await setupVault(auth, input);
  return json({ ok: true }, { status: 201 });
});
