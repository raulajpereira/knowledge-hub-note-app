import { z } from 'zod';
import { CODE_RE } from '@/server/licensing/codeFormat';

export const codeParam = async (ctx: { params: Promise<{ code: string }> }) =>
  z
    .string()
    .regex(CODE_RE)
    .parse((await ctx.params).code);
export type CodeCtx = { params: Promise<{ code: string }> };

export const NewCode = z
  .object({
    type: z.enum(['invite', 'license']),
    tenantId: z.uuid().nullable().optional(),
    plan: z.string().min(1).max(20),
    maxUses: z.number().int().min(1).max(10000),
    lifetime: z.boolean(),
    days: z.number().int().min(1).max(3650).optional(),
  })
  .strict();
export const EditCode = z
  .object({ maxUses: z.number().int().min(1).max(10000), expiresAt: z.iso.date().nullable() })
  .strict();
