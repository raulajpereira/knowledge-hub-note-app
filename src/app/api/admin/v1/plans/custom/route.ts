import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { setCustomPrices } from '@/server/admin/plans';

const price = z.number().min(0).max(10000);
const Patch = z
  .object({
    addon: z
      .object({ base: price, pro: price, mgmt: price, dev: price, sap: price, feat: price, custom: price })
      .partial()
      .strict(),
    customDisc: z.number().int().min(0).max(60),
  })
  .partial()
  .strict();

/** PATCH /plans/custom {addon?, customDisc?} — the "pacote individual" prices per module group. */
export const PATCH = handler(async (req) => {
  const a = await requireAdmin('plans', true);
  await setCustomPrices(a, await body(req, Patch));
  return json({ ok: true });
});
