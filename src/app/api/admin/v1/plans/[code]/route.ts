import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { updatePlan } from '@/server/admin/plans';

type Ctx = { params: Promise<{ code: string }> };
const Patch = z
  .object({
    price: z.number().min(0).max(10000),
    disc: z.number().int().min(0).max(60),
    trialEnabled: z.boolean(),
    trialDays: z.number().int().min(1).max(90),
  })
  .partial()
  .strict();

/** PATCH /plans/:code — monthly price, annual discount, trial. */
export const PATCH = handler(async (req, ctx: Ctx) => {
  const a = await requireAdmin('plans', true);
  const code = z
    .string()
    .regex(/^[A-Z]{2,20}$/)
    .parse((await ctx.params).code);
  await updatePlan(a, code, await body(req, Patch));
  return json({ ok: true });
});
