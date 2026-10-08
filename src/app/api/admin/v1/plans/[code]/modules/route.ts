import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { setPlanModules } from '@/server/admin/plans';

type Ctx = { params: Promise<{ code: string }> };

/** PUT /plans/:code/modules {modules} — "Módulos incluídos". */
export const PUT = handler(async (req, ctx: Ctx) => {
  const a = await requireAdmin('plans', true);
  const code = z
    .string()
    .regex(/^[A-Z]{2,20}$/)
    .parse((await ctx.params).code);
  const { modules } = await body(req, z.object({ modules: z.array(z.string().max(40)).max(100) }).strict());
  await setPlanModules(a, code, modules);
  return json({ ok: true });
});
