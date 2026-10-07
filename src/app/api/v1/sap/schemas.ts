import { z } from 'zod';
import { SAP_ENVS, TX_MOD_IDS, TX_TYPES } from '@/lib/sap';
import { CL_TYPE_IDS, ClNodesSchema, type ClType } from '@/lib/codelib';
import { FN_PAGES } from '@/lib/functional';

const s = (max: number) => z.string().trim().max(max);
export const SystemInput = z
  .object({
    clientId: z.uuid().nullable(),
    name: s(200).min(1),
    sid: z
      .string()
      .trim()
      .max(8)
      .regex(/^[A-Za-z0-9]*$/),
    env: z.enum(SAP_ENVS),
    type: s(120),
    host: z
      .string()
      .trim()
      .max(255)
      .regex(/^[^\s\r\n]*$/),
    inst: z.string().trim().max(4).regex(/^\d*$/),
    mandt: z.string().trim().max(4).regex(/^\d*$/),
    router: z
      .string()
      .trim()
      .max(500)
      .regex(/^[^\r\n]*$/),
    lang: z
      .string()
      .trim()
      .max(2)
      .regex(/^[A-Za-z]*$/),
    sapUser: z
      .string()
      .trim()
      .max(40)
      .regex(/^[^\r\n]*$/),
    fiori: z.union([z.literal(''), z.url({ protocol: /^https?$/ }).max(2000)]),
    notes: z.string().max(20000),
  })
  .partial()
  .strict();
export const TcodeInput = z
  .object({
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^[^\s]*$/),
    description: s(300),
    module: z.enum(TX_MOD_IDS as [string, ...string[]]),
    program: z.string().trim().max(60),
    type: z.enum(TX_TYPES),
    params: z.string().trim().max(1000),
    notes: z.string().max(20000),
  })
  .partial()
  .strict();

export const TransportInput = z
  .object({
    trkorr: z
      .string()
      .trim()
      .max(20)
      .regex(/^[A-Za-z0-9]*$/),
    description: s(500),
    clientId: z.uuid().nullable(),
    systemId: z.uuid().nullable(),
    type: z.enum(['W', 'C']),
    owner: z
      .string()
      .trim()
      .max(40)
      .regex(/^[^\r\n]*$/),
    notes: z.string().max(20000),
    steps: z
      .object({ released: z.boolean(), qas: z.boolean(), prd: z.boolean(), junk: z.boolean() })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\r\n,]*$/);
export const ObjectCreate = z.strictObject({
  type: z.enum(CL_TYPE_IDS as [ClType, ...ClType[]]),
  name: z
    .string()
    .max(120)
    .regex(/^[^\r\n]*$/)
    .optional(),
});
export const ObjectPatch = z.strictObject({
  name: z
    .string()
    .max(120)
    .regex(/^[^\r\n]*$/)
    .optional(),
  description: z
    .string()
    .max(500)
    .regex(/^[^\r\n]*$/)
    .optional(),
  tags: z.array(tag).max(30).optional(),
  nodes: ClNodesSchema.optional(),
  base: z.iso.datetime().optional(),
  force: z.boolean().optional(),
});

export const FnPageParam = z.enum(FN_PAGES);
export const FnCreate = z.strictObject({
  page: FnPageParam,
  title: z
    .string()
    .max(300)
    .regex(/^[^\r\n]*$/),
  f: z.record(z.string(), z.unknown()).optional(),
});
export const FnPatchInput = z.strictObject({
  title: z
    .string()
    .max(300)
    .regex(/^[^\r\n]*$/)
    .optional(),
  code: z
    .string()
    .max(120)
    .regex(/^[^\r\n]*$/)
    .optional(),
  st: z.string().max(20).optional(),
  // checked against the page's schema by the service
  f: z.record(z.string(), z.unknown()).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  base: z.iso.datetime().optional(),
  force: z.boolean().optional(),
});
