import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { LIMIT_KEYS, setLimits } from '@/server/admin/plans';

type Ctx = { params: Promise<{ code: string }> };
const n = z.number().int().min(0).max(1_000_000).nullable();

/** PUT /plans/:code/limits — "Limites de criação" (null = unlimited). */
export const PUT = handler(async (req, ctx: Ctx) => {
  const a = await requireAdmin('plans', true);
  const code = z
    .string()
    .regex(/^[A-Z]{2,20}$/)
    .parse((await ctx.params).code);
  const limits = await body(
    req,
    z
      .object(Object.fromEntries(LIMIT_KEYS.map((k) => [k, n])))
      .partial()
      .strict(),
  );
  await setLimits(a, code, limits as Partial<Record<(typeof LIMIT_KEYS)[number], number | null>>);
  return json({ ok: true });
});
