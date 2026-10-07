import { z } from 'zod';

export const Kv = z.object({ k: z.string().max(500), v: z.string().max(20_000), on: z.boolean() });
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const RequestPatch = z.object({
  folderId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  method: z.enum(METHODS).optional(),
  url: z.string().max(8000).optional(),
  params: z.array(Kv).max(200).optional(),
  headers: z.array(Kv).max(200).optional(),
  bodyType: z.enum(['none', 'json', 'form', 'xml', 'text']).optional(),
  body: z.string().max(1_000_000).optional(),
  authType: z.enum(['none', 'basic', 'bearer']).optional(),
  auth: z
    .object({ token: z.string().max(20_000), user: z.string().max(500), pass: z.string().max(1000) })
    .optional(),
});
