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

const TENANT_ST = ['trial', 'active', 'past_due', 'suspended', 'canceled'] as const;
const GROUPS = ['base', 'pro', 'mgmt', 'dev', 'sap', 'feat', 'custom'] as const;
export const ClientPatchZ = z
  .object({
    name: z.string().trim().min(1).max(120),
    plan: z.string().min(1).max(20),
    addonGroups: z.array(z.enum(GROUPS)).max(7),
    cycle: z.enum(['monthly', 'annual']),
    seats: z.number().int().min(1).max(10000),
    renewAt: z.iso.date().nullable(),
    status: z.enum(TENANT_ST),
    contactName: z.string().trim().max(120),
    contactEmail: z.union([z.email().max(254), z.literal('')]),
  })
  .partial()
  .strict();
export const NewClientZ = z
  .object({
    name: z.string().trim().min(1).max(120),
    contactName: z.string().trim().max(120).default(''),
    contactEmail: z.email().max(254),
    plan: z.string().min(1).max(20),
    cycle: z.enum(['monthly', 'annual']),
    seats: z.number().int().min(1).max(10000),
    start: z.enum(['trial', 'active']),
  })
  .strict();
export const UserPatchZ = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    role: z.enum(['admin', 'member']),
    status: z.enum(['active', 'paused', 'disabled']),
  })
  .partial()
  .strict();
export const AdminRoleZ = z.enum(['admin', 'billing', 'support', 'readonly']);
