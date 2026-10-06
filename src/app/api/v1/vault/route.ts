import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { getVault, wipeVault } from '@/server/content/vault';

// GET /vault — keys (or null before setup) and the encrypted items.
export const GET = handler(async () => {
  const auth = await requireContent('passwords');
  return json(await getVault(auth));
});

/** DELETE /vault — "Repor e Apagar" (forgotten master password and no recovery key). */
export const DELETE = handler(async () => {
  const auth = await requireContent('passwords');
  await wipeVault(auth);
  return json({ ok: true });
});
