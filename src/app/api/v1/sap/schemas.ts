import { z } from 'zod';
import { SAP_ENVS, TX_MOD_IDS, TX_TYPES } from '@/lib/sap';

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
